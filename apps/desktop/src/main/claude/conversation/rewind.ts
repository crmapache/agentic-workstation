import { homedir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'

import type {
  RewindScope,
  RewindOutcome,
  RewindPreview,
  RewindRefusal,
} from '@shared/claude-rewind'

import { isRecord, stringField } from '../cli/cli-messages'
import type { CliProcess } from '../cli/cli-process'
import { fileCheckpointing } from '../config/config-files'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { claudeOf } from './claude-conversation'
import { REWOUND_DENY, REWIND_ATTEMPTS, REWIND_RETRY_MS } from './conversation.constants'
import {
  codeOf,
  cutDetail,
  refusalOf,
  codeDetail,
  restoredOf,
  codeOfError,
  waitsOnUnread,
  refusalOfError,
  relativePreview,
} from './rewind-replies'

type Asked =
  | { ok: true; reply: Record<string, unknown> }
  | { ok: false; refusal: RewindRefusal; detail: string }

/**
 * Ответ CLI на управляющий запрос. Ошибка канала - отказ с причиной, а не исключение:
 * процесс, ушедший посреди отката, говорит об этом, а не оставляет окно ждать.
 */
const ask = async (process: CliProcess, request: Record<string, unknown>): Promise<Asked> => {
  try {
    const reply = await process.control(request)

    return { ok: true, reply: isRecord(reply) ? reply : {} }
  } catch (error: unknown) {
    console.warn('[claude] откат:', request['subtype'], error)

    return { ok: false, ...refusalOfError(error) }
  }
}

const filesRequest = (messageId: string, dryRun: boolean) => ({
  subtype: 'rewind_files',
  user_message_id: messageId,
  ...(dryRun ? { dry_run: true } : {}),
})

/** Что вернёт откат кода, ничего не трогая. */
const checkFiles = async (process: CliProcess, messageId: string): Promise<RewindPreview> => {
  const asked = await ask(process, filesRequest(messageId, true))

  return asked.ok ? codeOf(asked.reply) : codeOfError(asked.refusal, asked.detail)
}

/** Вернуть файлы: null - вернулись, иначе слова CLI. */
const restoreFiles = async (process: CliProcess, messageId: string): Promise<string | null> => {
  const asked = await ask(process, filesRequest(messageId, false))

  return asked.ok ? restoredOf(asked.reply) : asked.detail || asked.refusal
}

/** Текст своего сообщения в ленте: после отката он возвращается в поле. */
const userText = (runtime: ConversationRuntime, messageId: string): string | null => {
  const item = claudeOf(runtime).feed.builder.items.find((entry) => entry.id === messageId)

  return item?.kind === 'user' ? item.text : null
}

/** Самое свежее сообщение, которое видела панель: CLI не режет то, чего она не видела. */
const lastSeenUuid = (runtime: ConversationRuntime): string | null => {
  const lastInFeed = claudeOf(runtime).feed.builder.items.findLast(
    (item) => item.kind === 'user' && !item.steering,
  )

  return claudeOf(runtime).lastSentUuid ?? lastInFeed?.id ?? null
}

/**
 * Откат прошёл: лента без отрезанного, ход закрыт, очередь на момент нажатия снята.
 * Вопросы, которые ждали (субагент из прошлого хода), получают отказ: на каждый
 * запрос CLI - ответ, иначе субагент ждёт вечно. Карточки «!», которых модель ещё не
 * видела, остаются: это терминал человека, а не разговор.
 */
const applyRewound = (
  runtime: ConversationRuntime,
  process: CliProcess,
  messageId: string,
  queuedAtPress: readonly string[],
) => {
  for (const held of runtime.held) {
    process.respond(held.pending.requestId, { behavior: 'deny', message: REWOUND_DENY })
  }

  claudeOf(runtime).discardStray = runtime.turnActive
  runtime.held = []
  runtime.turnActive = false
  claudeOf(runtime).lastSentUuid = null
  claudeOf(runtime).feed.builder.truncateFrom(messageId, claudeOf(runtime).shells.pendingIds())
  claudeOf(runtime).feed.builder.addNotice('rewound')
  claudeOf(runtime).feed.flush()
  runtime.dropQueued(queuedAtPress)
  runtime.update({ turnStartedAt: null, stopRequestedAt: null })
  runtime.syncStatus()
}

const refused = (reason: RewindRefusal, detail: string): RewindOutcome => ({
  rewound: false,
  reason,
  detail,
})

/**
 * Копии файлов выключены человеком (`checkpoints`): откат кода невозможен, и это не сбой
 * CLI, а настройка - диалог говорит «выключено» (как в ACC). Процесс, поднятый раньше
 * выключения, копии ещё держит, но вернуть ими код значило бы спорить с настройкой.
 */
const checkpointsOff = async (runtime: ConversationRuntime): Promise<boolean> => {
  return !(await fileCheckpointing(runtime.meta.projectPath))
}

/**
 * Какие файлы вернёт откат кода к сообщению - пути от корня проекта или от «~». Ничего
 * не меняет. Процесс не поднялся - unavailable без слов.
 */
export const previewRewind = async (
  runtime: ConversationRuntime,
  messageId: string,
): Promise<RewindPreview> => {
  if (await checkpointsOff(runtime)) return { state: 'off' }

  const process = (await runtime.prepareSession()) && claudeOf(runtime).process

  if (!process) return { state: 'unavailable', detail: '' }

  const preview = await checkFiles(process, messageId).finally(() => runtime.scheduleSleep())

  return relativePreview(preview, runtime.meta.projectPath, homedir())
}

/**
 * Обрезать разговор в CLI. Идущий ход режется только с interrupt_if_running; если CLI
 * держит непрочитанное сообщение (commands_queued, prompt_pending), ход
 * останавливается и запрос повторяется. Процесс, ушедший посреди запроса, - отказ
 * ended: сделан ли разрез, неизвестно, и лента не трогается.
 */
const cutConversation = async (
  runtime: ConversationRuntime,
  process: CliProcess,
  messageId: string,
): Promise<RewindOutcome> => {
  const queuedAtPress = runtime.meta.queue.map((item) => item.id)
  const ownText = userText(runtime, messageId)

  for (let attempt = 1; ; attempt += 1) {
    const wasRunning = runtime.turnActive
    const lastSeen = lastSeenUuid(runtime)
    const asked = await ask(process, {
      subtype: 'rewind_conversation',
      target_message_uuid: messageId,
      ...(lastSeen ? { last_seen_user_message_uuid: lastSeen } : {}),
      ...(wasRunning ? { interrupt_if_running: true } : {}),
    })

    if (!asked.ok) return refused(asked.refusal, asked.detail)

    const { reply } = asked

    if (reply['rewound'] === true) {
      applyRewound(runtime, process, messageId, queuedAtPress)

      return {
        rewound: true,
        prefill: ownText ?? stringField(reply, 'prefillText'),
        filesFailed: null,
      }
    }

    const reason = stringField(reply, 'reason')

    if (!waitsOnUnread(reason) || attempt >= REWIND_ATTEMPTS) {
      return refused(refusalOf(reason), cutDetail(reply))
    }

    runtime.interrupt()
    await delay(REWIND_RETRY_MS)
  }
}

/**
 * Откат к сообщению человека. Порядок как в ACC: проверка кода (dry run) → разговор →
 * файлы. Копии файлов переживают обрезку разговора, а отказ обрезки заранее не
 * проверить - так отказ не трогает ничего. Пока откат в пути, отложенный перезапуск
 * ждёт: итог прерванного хода может прийти раньше ответа на откат.
 */
export const rewind = async (
  runtime: ConversationRuntime,
  messageId: string,
  scope: RewindScope,
): Promise<RewindOutcome> => {
  runtime.rewinding = true

  try {
    return await rewindNow(runtime, messageId, scope)
  } finally {
    runtime.rewinding = false
    runtime.scheduleSleep()
    runtime.applyPendingRestart()
  }
}

const rewindNow = async (
  runtime: ConversationRuntime,
  messageId: string,
  scope: RewindScope,
): Promise<RewindOutcome> => {
  const process = (await runtime.prepareSession()) && claudeOf(runtime).process

  if (!process) return refused('noProcess', '')

  const withCode = scope !== 'conversation'
  const withConversation = scope !== 'code'

  if (withCode && (await checkpointsOff(runtime))) return refused('code', 'off')

  if (withCode) {
    const check = await checkFiles(process, messageId)

    if (check.state !== 'ready') return refused('code', codeDetail(check))
  }

  let prefill = ''

  if (withConversation) {
    const cut = await cutConversation(runtime, process, messageId)

    if (!cut.rewound) return cut

    prefill = cut.prefill
  }

  if (!withCode) return { rewound: true, prefill, filesFailed: null }

  const failed = await restoreFiles(process, messageId)

  // Только код: разговор не тронут, и отказ - отказ. С разговором - он уже откатился,
  // и окно говорит, что код остался как был.
  if (failed !== null && !withConversation) return refused('code', failed)

  return { rewound: true, prefill, filesFailed: failed }
}

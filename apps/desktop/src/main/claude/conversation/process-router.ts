import type { ConversationUsage } from '@shared/claude'

import { callForResult, callFromMessage } from '../calls/call-reasons'
import { announceAgentEdit } from '../changes/agent-edits-tap'
import type { CliMessage } from '../cli/cli-messages'
import { recordField, stringField } from '../cli/cli-messages'
import { mergeCommands, modelsFromReply, commandsFromInit, commandsFromChange } from './cli-replies'
import type { ConversationRuntime } from './conversation-runtime'
import { COMMAND_RESULT_GRACE_MS } from './conversation.constants'
import { forgetTitle } from './session-title'
import { lifecycleOf, isFinalState, isStartupResult } from './turn-command'
import { usageFromResult, liveContextTokens, usageFromContextReply } from './usage'

let modelsAsked = false

/**
 * Начало хода по `system/init`. Он приходит в голове каждого хода; если основного хода
 * не было, его начал сам CLI (досрочно закончился фоновый агент).
 */
const applyInit = (runtime: ConversationRuntime, init: CliMessage) => {
  const { meta, host, process } = runtime
  const sessionId = stringField(init, 'session_id')

  host.onCommands(
    meta.projectPath,
    mergeCommands(host.knownCommands(meta.projectPath), commandsFromInit(init)),
  )
  runtime.update({
    activeModel: stringField(init, 'model') || meta.activeModel,
    sessionId: sessionId || meta.sessionId,
  })

  if (!runtime.turnActive) {
    // Ход начал сам CLI: нашего сообщения за ним нет, отметки прошлого к нему не относятся.
    runtime.turnActive = true
    runtime.turnCommand = null
    runtime.update({ turnStartedAt: Date.now() })
    runtime.syncStatus()
  }

  // Окно контекста - с первого хода вкладки: итог хода принёс бы его только в конце, и
  // весь первый ход, сколько бы он ни шёл, кольцо стояло бы на нуле. Как в ACC - на
  // каждом init: CLI отвечает на это и посреди хода.
  askContext(runtime)

  if (!modelsAsked && process) {
    modelsAsked = true
    process
      .control({ subtype: 'list_models' })
      .then((reply) => host.onModels(modelsFromReply(reply)))
      .catch(() => {
        modelsAsked = false
      })
  }
}

/** Точные цифры контекста у CLI - занятое и окно. Не ответил - остаются прежние. */
const askContext = (runtime: ConversationRuntime) => {
  runtime.process
    ?.control({ subtype: 'get_context_usage' })
    .then((reply) => runtime.update({ usage: usageFromContextReply(reply, runtime.meta.usage) }))
    .catch(() => undefined)
}

/** Строки хода, которые после отката к нему уже не относятся к разговору. */
const STRAY_TYPES = new Set(['result', 'assistant', 'stream_event', 'user'])

/** Чем кончился ход: остановкой, ошибкой и с какими цифрами. */
type TurnEnd = { interrupted: boolean; isError: boolean; usage: ConversationUsage }

/** Ход закрыт - по итогу CLI или без него: вкладка свободна, цифры контекста, очередь, сон. */
const closeTurn = (runtime: ConversationRuntime, end: TurnEnd) => {
  const { feed } = runtime

  runtime.freshProcess = false
  runtime.turnCommand = null
  // Файлы хода - по точным правкам и сверкой с диском, пока их никто не тронул. Список
  // уточняется синхронно, до отправки окну: промежуточного окно не видит.
  runtime.turnRevert.captureEnd().catch((error: unknown) => {
    console.warn('[claude] файлы хода не сверились:', error)
  })
  feed.flush()

  runtime.turnActive = false
  runtime.update({
    turnStartedAt: null,
    stopRequestedAt: null,
    usage: end.usage,
    outcome: end.isError ? 'error' : end.interrupted ? 'interrupted' : 'done',
  })
  // Вопросы фоновых субагентов переживают конец хода: CLI ждёт на них ответа.
  runtime.syncStatus()

  askContext(runtime)

  runtime.host.onUsageHint(runtime)
  runtime.afterTurn(!end.interrupted && !end.isError)
}

/**
 * Конец хода: итог в ленту, цифры контекста, заголовок и очередь. Рукопожатие свежего
 * процесса (turn-command.ts) - не конец настоящего хода, который уже идёт: false.
 */
const applyResult = (runtime: ConversationRuntime, result: CliMessage): boolean => {
  const { feed, meta } = runtime
  const interrupted = meta.stopRequestedAt !== null

  if (isStartupResult(result, runtime.freshProcess, interrupted)) {
    runtime.freshProcess = false

    return false
  }

  const isError = result['is_error'] === true

  feed.builder.finishTurn(result, interrupted)

  const stillWorking = feed.builder.hasBackgroundWork
  const call = callForResult(result, { interrupted, stillWorking })

  if (call) runtime.host.onCall(meta.id, call)

  closeTurn(runtime, {
    interrupted,
    isError,
    usage: usageFromResult(result, meta.usage, meta.activeModel),
  })

  return true
}

/**
 * Отметка CLI о нашем сообщении. Взял в работу - процесс уже не «только поднят»: пустой
 * итог дальше - ответ на сообщение. Команда хода кончилась - её итог приходит раньше
 * отметки; если ход и после паузы всё ещё идёт, итог потерялся, и ход закрывается без
 * него, а не висит «в работе» с вечным Stop.
 */
const applyLifecycle = (runtime: ConversationRuntime, uuid: string, state: string) => {
  if (!uuid || runtime.turnCommand !== uuid) return

  if (state === 'started') runtime.freshProcess = false

  if (!isFinalState(state)) return

  setTimeout(() => {
    if (runtime.isDisposed || runtime.turnCommand !== uuid || !runtime.turnActive) return

    console.warn('[claude] команда хода кончилась, а итога нет - ход закрыт без него:', uuid)

    const interrupted = runtime.meta.stopRequestedAt !== null

    runtime.feed.builder.closeTurnWithoutResult(interrupted)
    closeTurn(runtime, { interrupted, isError: false, usage: runtime.meta.usage })
  }, COMMAND_RESULT_GRACE_MS).unref()
}

/**
 * Строка потока CLI - в ленту и в состояние разговора. Субагенты (`parent_tool_use_id`)
 * и их init ход не начинают и цифры контекста не трогают.
 */
export const routeMessage = (runtime: ConversationRuntime, message: CliMessage): void => {
  const { feed, host, meta } = runtime
  const isMain = !message['parent_tool_use_id']

  const isMainInit = message.type === 'system' && message.subtype === 'init' && !message['task_id']

  // Новый основной ход (его мог начать и сам CLI, когда досрочно кончился фоновый
  // агент) - уже не хвост отрезанного: иначе его итог потерялся бы, и разговор навсегда
  // остался бы «в работе».
  if (isMainInit && isMain) runtime.discardStray = false

  // Хвост хода, отрезанного откатом: CLI про него молчит, а то, что всё же пришло, - лишнее.
  if (runtime.discardStray && STRAY_TYPES.has(message.type)) return

  // Строки панели (прогресс вопроса сбоку, моды) - не события разговора: ленте их не нести.
  if (host.panel?.line(runtime, message)) return

  if (message.type === 'result') {
    // Итог отработан (очередь, перезапуск): следующее слово - продолжение оборванной работы.
    // Рукопожатие свежего процесса ходом не было - панели о нём знать незачем.
    if (applyResult(runtime, message)) host.panel?.afterResult(runtime, message)

    return
  }

  const lifecycle = isMain ? lifecycleOf(message) : null

  if (lifecycle) return applyLifecycle(runtime, lifecycle.uuid, lifecycle.state)

  // Лимит и ошибка ответа зовут человека (звук, свечение вкладки).
  callFromMessage(runtime, message, isMain)

  // Картина лимита поменялась (CLI шлёт это, когда окно подходит к пределу или упёрлось).
  if (message.type === 'rate_limit_event') host.onUsageHint(runtime)

  // Лента держит дифф правки обрезанным для показа - точные правки хода копит откат; их же
  // видит локальная история (ADR 0045): «до» правки агента, если её снимок опоздал.
  const edit = runtime.turnRevert.observe(message)

  if (edit) announceAgentEdit(edit)
  feed.builder.apply(message)
  feed.schedule()

  // Фоновый субагент начал или кончил работу - точка вкладки говорит «работает» и после хода.
  if (meta.backgroundWork !== feed.builder.hasBackgroundWork) {
    runtime.update({ backgroundWork: feed.builder.hasBackgroundWork })
  }

  // Вход истёк: процесс держит мёртвый токен в памяти - следующий ход пусть идёт в новом.
  if (message.type === 'assistant' && message['error'] === 'authentication_failed') {
    runtime.restartProcess()
  }

  if (isMainInit) {
    applyInit(runtime, message)
  } else if (message.type === 'system' && message.subtype === 'commands_changed') {
    const commands = commandsFromChange(message)

    if (commands) host.onCommands(meta.projectPath, commands)
  } else if (message.type === 'conversation_reset') {
    // /clear: CLI начал новый разговор под новым id - вкладка продолжает уже его, а
    // контекст и цена того разговора к этому отношения не имеют.
    feed.forgetEarlier()
    forgetTitle(runtime)
    runtime.update({
      sessionId: stringField(message, 'new_conversation_id') || meta.sessionId,
      usage: { ...meta.usage, contextTokens: 0 },
    })
  } else if ((message.type === 'assistant' || message.type === 'stream_event') && isMain) {
    runtime.freshProcess = false
  }

  if (message.type === 'assistant' && isMain) {
    const tokens = liveContextTokens(message)
    const model = stringField(recordField(message, 'message'), 'model')
    const isRealModel = Boolean(model) && !model.startsWith('<')

    if (tokens > 0 || isRealModel) {
      runtime.update({
        usage: tokens > 0 ? { ...meta.usage, contextTokens: tokens } : meta.usage,
        activeModel: isRealModel ? model : meta.activeModel,
      })
    }
  }
}

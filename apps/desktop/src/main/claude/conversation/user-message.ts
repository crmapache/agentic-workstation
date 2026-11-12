import { randomUUID } from 'node:crypto'

import type { EditorRef } from '@shared/claude-draft'

import type { CliProcess } from '../cli/cli-process'
import { takeReleasedFrame } from '../history/released-heads'
import { parseCarryOn } from '../panel/carry-on-words'
import { sealOwnText } from '../shell/shell-text'
import { rankOf } from '../tabs/tab-names'
import { nameAfterPerson } from '../tabs/tab-rename'
import type { ConversationRuntime } from './conversation-runtime'
import { draftTitle, isSlashCommand } from './conversation.utils'
import { editorReminder } from './editor-note'
import type { Outgoing } from './outbox'
import type { HeldRequest } from './pending-requests'
import { PLAN_ANSWERED_IN_CHAT, answerInChat as chatAnswer } from './pending-requests'
import { askTitle } from './session-title'

/**
 * Содержимое сообщения для CLI: картинки блоками перед текстом, как их кладёт терминал,
 * и заметка о редакторе последним блоком - отдельно от слов человека.
 */
const userContent = ({ text, images }: Outgoing, editor: EditorRef | null) => [
  ...images.map((image) => ({
    type: 'image',
    source: { type: 'base64', media_type: image.mediaType, data: image.data },
  })),
  ...(text ? [{ type: 'text', text }] : []),
  ...(editor ? [{ type: 'text', text: editorReminder(editor) }] : []),
]

/**
 * Сообщение человека - в ленту и в CLI под одним именем: CLI берёт присланный uuid за
 * имя своей строки, и по нему сообщение потом откатывается и форкается. Команды «!»,
 * которых модель не видела, едут перед текстом - в ленте их и так видно. Перед
 * командой «/» они не едут: CLI узнаёт команду только по первому символу, - и ждут
 * следующего обычного сообщения.
 */
export const writeUserMessage = (
  runtime: ConversationRuntime,
  process: CliProcess,
  message: Outgoing,
  steering: boolean,
): void => {
  const uuid = randomUUID()
  const { text, images } = message

  // Слова панели (продолжение работы) узнаются и по тегу - вынутые из очереди тоже: в
  // ленте они без тега, под подписью PANEL.
  const carried = parseCarryOn(text)
  const auto =
    message.auto ?? (carried && carried.reason !== 'unknown' ? carried.reason : undefined)
  const shown = carried ? carried.words : text

  // Догадка по первому сообщению - только поверх заглушки: имя от модели или от человека
  // она не перебивает (tabs/tab-names.ts). По словам панели вкладку не называют.
  if (rankOf(runtime.meta.titleSource) < rankOf('heuristic') && text && !auto) {
    runtime.update({ title: draftTitle(text), titleSource: 'heuristic' })
  }

  // Команда - приказ разговору, а не вопрос про код: заметку о редакторе она не несёт.
  const editor = isSlashCommand(text) ? null : (message.editor ?? null)

  runtime.lastSentUuid = uuid
  runtime.discardStray = false
  // Сообщение начинает ход: по отметкам CLI о нём видно, взят ли ход и кончился ли он.
  if (!steering) runtime.turnCommand = uuid
  runtime.feed.builder.addUserMessage(uuid, shown, images, steering, {
    draft: message.draft ?? undefined,
    editor: editor ?? undefined,
    auto,
  })
  runtime.feed.schedule()

  const own = sealOwnText(text)
  const shell = isSlashCommand(text) ? '' : runtime.shells.takeContext()
  // Голова прогона, открытая чатом: рамка о снятой роли - перед первым словом человека.
  const frame = isSlashCommand(text) ? '' : takeReleasedFrame(runtime.meta.sessionId)
  const said = [frame, shell, own].filter(Boolean).join('\n\n')
  const content = userContent({ text: said, images }, editor)

  process.write({ type: 'user', uuid, message: { role: 'user', content } })
  runtime.host.panel?.said(runtime, auto ?? null)
  // Имя от модели - после сообщения, чтобы ход не ждал за ним. По словам панели не называют.
  if (!auto) askTitle(runtime, process, text)
  nameAfterPerson(runtime, process)
}

/**
 * Человек написал в чат, пока ход стоит на вопросе. Сообщение уходит раньше отказа:
 * в обратном порядке модель переспрашивает (замер ACC на 2.1.280). Текст при плане -
 * это и есть замечание «доработай план»; с картинкой оно уходит сообщением (в отказ
 * картинку не положить), а отказ только отсылает к нему. Посреди хода - только если
 * основной ход правда идёт: вопрос фонового субагента после хода начинает новый.
 */
export const answerInChat = (
  runtime: ConversationRuntime,
  held: HeldRequest,
  message: Outgoing,
): void => {
  const { process } = runtime

  if (!process) return

  runtime.held = runtime.held.filter((entry) => entry !== held)

  const isPlanNote = held.pending.kind === 'plan' && message.images.length === 0

  if (isPlanNote) {
    // Замечание к плану уходит отказом, а не сообщением: CLI его имени не знает.
    runtime.feed.builder.addUserMessage(randomUUID(), message.text, [], true, {
      draft: message.draft ?? undefined,
    })
    runtime.feed.schedule()
  } else {
    writeUserMessage(runtime, process, message, runtime.turnActive)
  }

  const answer =
    held.pending.kind === 'plan' && !isPlanNote
      ? { behavior: 'deny', message: PLAN_ANSWERED_IN_CHAT }
      : chatAnswer(held, message.text)

  process.respond(held.pending.requestId, answer)
  runtime.syncStatus()
}

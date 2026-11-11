import { randomUUID } from 'node:crypto'

import type { QueueHold, QueuedMessage, ImageAttachment } from '@shared/claude'
import type { EditorRef, TakenQueued, MessageDraft } from '@shared/claude-draft'
import type { CarryOnReason } from '@shared/claude-panel'

import type { ConversationRuntime } from './conversation-runtime'
import { isSlashCommand } from './conversation.utils'
import { withImageData } from './message-draft'
import { answerInChat, writeUserMessage } from './user-message'

/**
 * Сообщение человека к отправке: текст для CLI, картинки, куски для ленты и очереди и
 * то, что было открыто в редакторе в момент нажатия.
 */
export type Outgoing = {
  text: string
  images: ImageAttachment[]
  draft?: MessageDraft | null | undefined
  editor?: EditorRef | null | undefined
  /** Написала панель сама (продолжение оборванной работы): в ленте - PANEL, текст в теге. */
  auto?: CarryOnReason | undefined
}

/**
 * Куда в очереди встаёт сообщение. head - вынутое из очереди и не ушедшее, на своё место;
 * tail - новое; before - поправленное в поле, перед соседом, за которым оно стояло.
 */
type QueuePlace = 'head' | 'tail' | { before: string | null }

/**
 * Исходящие сообщения разговора: отправки строго по одной, в порядке нажатия, и очередь
 * отложенных. Очередь уходит сама, только когда разговор свободен (нет хода и вопросов
 * к человеку) и её ничто не держит. Сообщение, которое не смогло уйти, не пропадает, а
 * ждёт в очереди. Картинки и редактор очереди - здесь, в памяти: окну хватает их числа,
 * а редактор берётся тот, что был открыт при нажатии Queue, а не в момент отправки.
 */
export class ConversationOutbox {
  private readonly images = new Map<string, ImageAttachment[]>()
  private readonly editors = new Map<string, EditorRef>()
  private chain: Promise<void> = Promise.resolve()
  /**
   * Что держит очередь (QueueHold): после остановки или ошибки слать дальше в ошибку
   * незачем, не ушедшее ждёт снятия причины. Окно видит это в подписи очереди.
   */
  private holdValue: QueueHold | null

  constructor(private readonly runtime: ConversationRuntime) {
    // Очередь, пережившая перезапуск IDE, - сообщения, которые так и не ушли. Разговор
    // ещё собирается: метка - прямо в его данные, без рассылки.
    this.holdValue = runtime.meta.queue.length > 0 ? 'blocked' : null
    runtime.meta = { ...runtime.meta, queueHold: this.holdValue ?? undefined }
  }

  /** Очередь ждёт человека или снятия причины, а не конца хода: процесс может уснуть. */
  get isHeld(): boolean {
    return this.hold !== null
  }

  private get hold(): QueueHold | null {
    return this.holdValue
  }

  /** Метка едет в данные разговора: окно подписывает ею очередь. */
  private set hold(value: QueueHold | null) {
    this.holdValue = value

    if ((this.runtime.meta.queueHold ?? null) !== value) {
      this.runtime.update({ queueHold: value ?? undefined })
    }
  }

  /** Картинки очереди: закрытая вкладка уносит их с собой (tabs/closed-tabs.ts). */
  get queueImages(): ReadonlyMap<string, ImageAttachment[]> {
    return this.images
  }

  /**
   * Вернувшаяся закрытая вкладка: её очередь ждала хода, который закрытие убило, и
   * уйдёт после следующего сообщения человека, а не сама.
   */
  adoptQueue(images: ReadonlyMap<string, ImageAttachment[]>): void {
    for (const [id, list] of images) this.images.set(id, list)

    if (this.runtime.meta.queue.length > 0) this.hold = 'reopened'
  }

  send(message: Outgoing): Promise<void> {
    return this.sendInOrder(message, 'tail')
  }

  /**
   * Отложить до конца хода. Разговор свободен - отправить сразу, ждать нечего. before -
   * сосед, перед которым встать (сообщение вынимали поправить).
   */
  enqueue(message: Outgoing, before: string | null = null): Promise<void> {
    if (this.runtime.isFree) return this.send(message)
    if (isEmpty(message)) return Promise.resolve()

    this.push({ ...message, text: message.text.trim() }, { before })

    return Promise.resolve()
  }

  remove(queuedId: string): void {
    const { queue } = this.runtime.meta

    this.forget(queuedId)
    this.runtime.update({ queue: queue.filter((item) => item.id !== queuedId) })
    // Последнее придержанное ушло - метка уходит с ним, а не ждёт следующего сообщения.
    if (this.runtime.meta.queue.length === 0) this.hold = null
  }

  /** Убрать разом (откат: очередь, написанная про отрезанное, уходит вместе с ним). */
  removeAll(queuedIds: readonly string[]): void {
    const ids = new Set(queuedIds)

    for (const id of ids) this.forget(id)

    this.hold = null
    this.runtime.update({ queue: this.runtime.meta.queue.filter((item) => !ids.has(item.id)) })
  }

  /**
   * Вынуть сообщение в поле: пока его правят, оно вне очереди - иначе выстрелило бы в
   * конце хода недописанным. Место запоминается соседом, а не номером: пока правят,
   * очередь двигается.
   */
  takeOut(queuedId: string): TakenQueued | null {
    const { queue } = this.runtime.meta
    const index = queue.findIndex((item) => item.id === queuedId)
    const item = queue[index]

    if (!item) return null

    const images = this.images.get(queuedId) ?? []
    const draft = item.draft ? withImageData(item.draft, images) : null

    this.remove(queuedId)

    return { text: item.text, draft, before: queue[index + 1]?.id ?? null }
  }

  /** Переставить сообщение на место toIndex (перетаскивание за ручку). */
  move(queuedId: string, toIndex: number): void {
    const queue = [...this.runtime.meta.queue]
    const from = queue.findIndex((item) => item.id === queuedId)
    const [item] = from >= 0 ? queue.splice(from, 1) : []

    if (!item) return

    queue.splice(Math.max(0, Math.min(toIndex, queue.length)), 0, item)
    this.runtime.update({ queue })
  }

  /** Отправить отложенное сейчас: во время хода модель прочтёт его на следующем шаге. */
  sendQueued(queuedId: string): Promise<void> {
    const item = this.runtime.meta.queue.find((entry) => entry.id === queuedId)

    if (!item) return Promise.resolve()

    const message = this.messageOf(item)

    this.remove(queuedId)

    return this.sendInOrder(message, 'head')
  }

  /** Ход кончился: чистый - очередь идёт дальше, остановка или ошибка - ждёт человека. */
  afterTurn(isClean: boolean): Promise<void> {
    if (isClean) this.hold = null
    else if (this.runtime.meta.queue.length > 0) this.hold = 'paused'

    return this.drain()
  }

  /** Причину, которая держала очередь, сняли: ждавшие сообщения уходят. */
  release(): Promise<void> {
    this.hold = null

    return this.drain()
  }

  /** Первое из очереди - если разговор свободен и очередь ничто не держит. */
  drain(): Promise<void> {
    const [next] = this.runtime.meta.queue

    if (!next || this.hold !== null || !this.runtime.isFree) return Promise.resolve()

    return this.sendQueued(next.id)
  }

  /** Сообщение очереди целиком: текст, куски и то, что держится здесь в памяти. */
  private messageOf(item: QueuedMessage): Outgoing {
    return {
      text: item.text,
      images: this.images.get(item.id) ?? [],
      draft: item.draft,
      editor: this.editors.get(item.id) ?? null,
    }
  }

  private forget(queuedId: string) {
    this.images.delete(queuedId)
    this.editors.delete(queuedId)
  }

  private push(message: Outgoing, place: QueuePlace) {
    const item: QueuedMessage = {
      id: randomUUID(),
      text: message.text,
      imageCount: message.images.length,
      draft: message.draft ?? null,
    }
    const { queue } = this.runtime.meta

    if (message.images.length > 0) this.images.set(item.id, message.images)
    if (message.editor) this.editors.set(item.id, message.editor)

    this.runtime.update({ queue: placed(queue, item, place) })
  }

  /** place - куда встанет сообщение, если не уйдёт: вынутое из очереди - на своё место. */
  private sendInOrder(message: Outgoing, place: QueuePlace): Promise<void> {
    if (isEmpty(message)) return Promise.resolve()

    const trimmed = { ...message, text: message.text.trim() }

    this.chain = this.chain
      .then(() => this.sendNow(trimmed, place))
      .catch((error: unknown) => console.warn('[claude] сообщение не ушло:', error))

    return this.chain
  }

  private async sendNow(message: Outgoing, place: QueuePlace): Promise<void> {
    const { runtime } = this

    if (runtime.isDisposed) return

    // Человек нажал «погасить» - дождаться конца процесса, а не писать в умирающий.
    await runtime.settleStopping()

    // Команда CLI - не ответ на вопрос и не подсказка посреди хода: ждёт своей очереди.
    if (isSlashCommand(message.text) && !runtime.isFree) return this.push(message, place)

    const [question] = runtime.held

    if (question) return answerInChat(runtime, question, message)

    // Ждавшие не обгоняются: новое встаёт за ними, первой уходит голова очереди.
    const [head] = runtime.meta.queue

    if (place === 'tail' && head && this.hold === 'blocked' && !runtime.turnActive) {
      const waiting = this.messageOf(head)

      this.remove(head.id)
      this.push(message, 'tail')

      return this.sendNow(waiting, 'head')
    }

    const startsTurn = !runtime.turnActive

    // Новый ход - в процесс с новым конфигом и аккаунтом, если их сменили.
    if (startsTurn) runtime.applyPendingRestart()

    if (startsTurn) {
      runtime.turnActive = true
      runtime.syncStatus()
    }

    // Отказ подготовки не должен оставить ход «в работе», а сообщение - потерянным: оно
    // ждёт в очереди, причина - во вкладке.
    const process = await runtime.prepareProcess().catch((error: unknown) => {
      console.warn('[claude] процесс разговора не подготовлен', error)
      runtime.update({ error: 'start-failed' })

      return null
    })

    if (!process) {
      if (startsTurn) runtime.turnActive = false

      this.hold = 'blocked'
      this.push(message, place)

      return runtime.syncStatus()
    }

    if (this.hold === 'blocked') this.hold = null

    writeUserMessage(runtime, process, message, !startsTurn)

    if (startsTurn) runtime.update({ turnStartedAt: Date.now(), stopRequestedAt: null })
  }
}

const isEmpty = (message: Outgoing) => !message.text.trim() && message.images.length === 0

/** Очередь с сообщением на месте: перед соседом, а ушедший сосед - конец. */
const placed = (
  queue: readonly QueuedMessage[],
  item: QueuedMessage,
  place: QueuePlace,
): QueuedMessage[] => {
  if (place === 'head') return [item, ...queue]
  if (place === 'tail' || place.before === null) return [...queue, item]

  const at = queue.findIndex((entry) => entry.id === place.before)

  return at < 0 ? [...queue, item] : [...queue.slice(0, at), item, ...queue.slice(at)]
}

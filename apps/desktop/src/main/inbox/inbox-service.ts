import type {
  InboxItem,
  InboxState,
  InboxAction,
  InboxOutcome,
  InboxActRequest,
  InboxReminderRequest,
} from '@shared/inbox'
import { isInboxAsking } from '@shared/inbox'
import type { ProviderId } from '@shared/providers'
import type { Task, TaskRun, TaskOutcome } from '@shared/tasks'

import type { JsonFile } from '../storage/json-file'
import { pressedNote } from '../tasks/task-briefing'
import type { TaskAnswer } from '../tasks/task-desk'
import type { TaskService, TaskInboxPort } from '../tasks/task-service'
import type { CardAsk } from '../scenarios/engine/run-mail'
import { askItem, blankItem, finishItem, goalWaitsItem } from './inbox-items'
import { BODY_MAX, TITLE_MAX } from './inbox-notice'
import { itemOf, closeItem, pruneItems, settleStale } from './inbox-rules'

export type StoredInbox = { items: InboxItem[] }

/** Разговор панели, приславший уведомление: куда вернуть нажатие кнопки. */
export type ChatOrigin = { provider: ProviderId; conversationId: string; sessionId: string }

/** Куда уходят нажатия: прогоны заданий, разговоры панели, доверие папке, открыть файл. */
export type InboxRoutes = {
  tasks: Pick<TaskService, 'answer' | 'tell' | 'resume' | 'again' | 'openChat'>
  sendToChat: (origin: ChatOrigin, projectPath: string, text: string) => Promise<boolean>
  /** Довериться папке прогона - у провайдера этого прогона. */
  trust: (projectPath: string, runId: string) => Promise<unknown>
  openPath: (path: string) => Promise<boolean>
  openUrl: (url: string) => boolean
}

export type InboxEvents = {
  onState: (state: InboxState) => void
  /** Уведомление стало видно (новое или пришёл срок): окну - карточка и звук, ОС - баннер. */
  onArrived: (item: InboxItem) => void
}

const DISMISSED_QUESTION = 'The person dismissed this without an answer.'
const DECLINED = 'The person declined.'
const KEEP_PLANNING = 'The person did not approve the plan. Keep planning.'

/**
 * Уведомления IDE (ADR 0069): одна лента на IDE, файлом `inbox.json` в userData. Вопросы и
 * итоги прогонов заданий приходят сами (TaskInboxPort), сообщения и напоминания - от ИИ через
 * коннектор уведомлений; кнопка уводит ответ туда, откуда пришло уведомление.
 */
export class InboxService implements TaskInboxPort {
  /** Ставит связка: прогоны заданий и разговоры поднимаются раньше уведомлений. */
  routes: InboxRoutes | null = null
  private writing: Promise<unknown> = Promise.resolve()
  /** Уведомления, чья кнопка нажата и ответ ещё идёт. */
  private readonly pressing = new Set<string>()

  private constructor(
    private readonly file: JsonFile<StoredInbox>,
    private readonly events: InboxEvents,
    private items: InboxItem[],
  ) {}

  static async load(file: JsonFile<StoredInbox>, events: InboxEvents): Promise<InboxService> {
    const raw = (await file.read()) as { items?: unknown } | null
    const now = Date.now()
    const items = (
      Array.isArray(raw?.items) ? raw.items.flatMap((one) => itemOf(one) ?? []) : []
    ).map((item) => settleStale(item, now))

    return new InboxService(file, events, pruneItems(items, now))
  }

  view(): InboxState {
    return { items: this.items }
  }

  all(): readonly InboxItem[] {
    return this.items
  }

  /** Новое уведомление; со сроком в будущем - ждёт своего такта. */
  post(item: InboxItem): InboxItem {
    const now = Date.now()
    const posted = item.deliverAt <= now ? { ...item, arrivedAt: now } : item

    this.items = pruneItems([posted, ...this.items], now)
    this.changed()

    if (posted.arrivedAt) this.events.onArrived(posted)

    return posted
  }

  /**
   * Такт: пришёл срок напоминаний - они становятся видны. И то, чей срок пришёл, пока IDE была
   * закрыта: оно ещё не показано (arrivedAt 0) и покажется сейчас, один раз.
   */
  tick(): void {
    const now = Date.now()
    const due = this.items.filter(
      (item) => item.doneAt === 0 && item.arrivedAt === 0 && item.deliverAt <= now,
    )

    if (due.length === 0) return

    const ids = new Set(due.map((item) => item.id))

    this.update(
      (item) => ids.has(item.id),
      (item) => ({ ...item, arrivedAt: now }),
    )

    for (const item of this.items.filter((one) => ids.has(one.id))) this.events.onArrived(item)
  }

  asked(run: TaskRun, ask: CardAsk): void {
    this.post(askItem(run, ask))
  }

  withdrawn(run: TaskRun, requestId: string): void {
    this.update(
      (item) =>
        item.origin.kind === 'task' && item.origin.runId === run.id && item.requestId === requestId,
      (item) => closeItem(item, 'withdrawn', Date.now()),
    )
  }

  finished(run: TaskRun, task: Task | undefined): void {
    const item = finishItem(run, task)

    if (item) this.post(item)
  }

  goalWaits(run: TaskRun): void {
    this.post(goalWaitsItem(run))
  }

  markRead(ids: readonly string[]): InboxState {
    const now = Date.now()

    this.update(
      (item) => ids.includes(item.id) && item.readAt === 0 && item.arrivedAt > 0,
      (item) => ({ ...item, readAt: now }),
    )

    return this.view()
  }

  /** Закрыть; вопрос прогона при этом отклоняется - иначе прогон ждал бы вечно. */
  dismiss(ids: readonly string[]): InboxOutcome {
    for (const item of this.items.filter((one) => ids.includes(one.id) && one.doneAt === 0)) {
      // Сначала закрыть: прогон снимает вопрос сразу, и «вопрос снят» встало бы первым.
      this.close(item.id, 'dismissed')

      if (isInboxAsking(item) && item.origin.kind === 'task') {
        this.routes?.tasks.answer(item.origin.runId, item.requestId, {
          kind: 'deny',
          message: DISMISSED_QUESTION,
        })
      }
    }

    return { ok: true, state: this.view() }
  }

  clearDone(): InboxState {
    this.items = this.items.filter((item) => item.doneAt === 0)
    this.changed()

    return this.view()
  }

  remind(request: InboxReminderRequest): InboxOutcome {
    const title = request.title.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX)

    if (!title) return { ok: false, code: 'noTitle' }
    if (!Number.isFinite(request.deliverAt) || request.deliverAt <= Date.now()) {
      return { ok: false, code: 'badTime' }
    }

    this.post(
      blankItem({
        kind: 'reminder',
        title,
        body: request.body.trim().slice(0, BODY_MAX),
        deliverAt: request.deliverAt,
      }),
    )

    return { ok: true, state: this.view() }
  }

  /**
   * Нажатие кнопки: ответ туда, откуда уведомление пришло, и закрытие, если ответ дан. Второе
   * нажатие, пока первое ещё идёт (двойной клик, кнопка в углу и на виде), ничего не делает:
   * «продолжить» дважды подняло бы два процесса на один разговор.
   */
  async act(request: InboxActRequest): Promise<InboxOutcome> {
    if (this.pressing.has(request.itemId)) return { ok: true, state: this.view() }

    this.pressing.add(request.itemId)

    try {
      return await this.press(request)
    } finally {
      this.pressing.delete(request.itemId)
    }
  }

  private async press({ itemId, actionId, text, answers }: InboxActRequest): Promise<InboxOutcome> {
    const item = this.items.find((one) => one.id === itemId)
    const button = item?.actions.find((one) => one.id === actionId)
    const routes = this.routes

    if (!item || item.doneAt !== 0) return { ok: false, code: 'itemGone' }
    if (!button || !routes) return { ok: false, code: 'actionGone' }

    const runId = item.origin.kind === 'task' ? item.origin.runId : ''
    // Ответ на вопросы помнится словами ответа: «Hello», а не «Send answer».
    const label =
      button.kind === 'answer' && answers
        ? Object.values(answers).join('; ').slice(0, 120)
        : button.label || button.kind
    const done = (outcome: TaskOutcome): InboxOutcome => {
      if (!outcome.ok)
        return { ok: false, code: outcome.code === 'runBusy' ? 'runBusy' : 'runGone' }

      this.close(item.id, label)

      return { ok: true, state: this.view() }
    }
    // Ответ на вопрос прогона: уведомление закрывается нажатой кнопкой до ответа - прогон снимает
    // вопрос сразу, и закрытие «вопрос снят» иначе встало бы первым.
    const answer = (reply: TaskAnswer): InboxOutcome => {
      this.close(item.id, label)

      if (routes.tasks.answer(runId, item.requestId, reply)) return { ok: true, state: this.view() }

      this.update(
        (one) => one.id === item.id,
        (one) => ({ ...one, outcome: 'withdrawn' }),
      )

      return { ok: false, code: 'runGone' }
    }

    switch (button.kind) {
      case 'dismiss':
        return this.dismiss([item.id])
      case 'showRun':
        return { ok: true, state: this.markRead([item.id]) }
      case 'open':
        return this.open(item, button)
      case 'openChat':
        this.markRead([item.id])

        return (await routes.tasks.openChat(runId)).ok
          ? { ok: true, state: this.view() }
          : { ok: false, code: 'runGone' }
      case 'reply':
        return this.reply(item, button, text)
      case 'allow':
      case 'approve':
        return answer({ kind: 'allow' })
      case 'deny':
        return answer({ kind: 'deny', message: text.trim() || DECLINED })
      case 'revise':
        return answer({ kind: 'deny', message: text.trim() || KEEP_PLANNING })
      case 'answer':
        if (!answers || Object.keys(answers).length === 0) return { ok: false, code: 'failed' }

        return answer({ kind: 'answers', answers })
      case 'runAgain':
        return done(await routes.tasks.again(runId))
      case 'resume':
        return done(await routes.tasks.resume(runId))
      case 'trust':
        await routes.trust(item.projectPath, runId)

        return done(await routes.tasks.again(runId))
    }
  }

  /** Закрыть уведомление словом, если оно ещё открыто. */
  close(itemId: string, outcome: string): void {
    this.update(
      (item) => item.id === itemId,
      (item) => closeItem(item, outcome, Date.now()),
    )
  }

  private async open(item: InboxItem, button: InboxAction): Promise<InboxOutcome> {
    const routes = this.routes
    const target = button.value
    const opened = /^https?:\/\//i.test(target)
      ? (routes?.openUrl(target) ?? false)
      : ((await routes?.openPath(target)) ?? false)

    this.markRead([item.id])

    return opened ? { ok: true, state: this.view() } : { ok: false, code: 'openFailed' }
  }

  /** Кнопка ответа от ИИ: слова в разговор, приславший уведомление (прогон или вкладку). */
  private async reply(item: InboxItem, button: InboxAction, text: string): Promise<InboxOutcome> {
    const routes = this.routes
    const said = [button.value, text].filter((one) => one.trim()).join('\n')
    const note = pressedNote(item.title, button.label, said)
    const { origin } = item
    const sent =
      origin.kind === 'task'
        ? (await routes?.tasks.tell(origin.runId, note))?.ok === true
        : origin.kind === 'chat'
          ? ((await routes?.sendToChat(origin, item.projectPath, note)) ?? false)
          : false

    if (!sent) return { ok: false, code: origin.kind === 'chat' ? 'chatGone' : 'runGone' }

    this.close(item.id, button.label)

    return { ok: true, state: this.view() }
  }

  private update(match: (item: InboxItem) => boolean, edit: (item: InboxItem) => InboxItem) {
    let touched = false

    this.items = this.items.map((item) => {
      if (!match(item)) return item

      const next = edit(item)

      touched ||= next !== item

      return next
    })

    if (touched) this.changed()
  }

  private changed() {
    const snapshot: StoredInbox = { items: this.items }

    this.writing = this.writing
      .then(() => this.file.write(snapshot))
      .catch((error: unknown) => console.warn('[inbox] уведомления не записались:', error))
    this.events.onState(this.view())
  }
}

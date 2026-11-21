import type { NoticeCode, StopReason, NoticeExtra, ClosedReason } from '@shared/conversation-feed'

import type { CliMessage } from '../cli/cli-messages'
import { numberField, stringField } from '../cli/cli-messages'
import type { FeedStore } from '../../agents/feed/feed-store'
import type { TurnTracker } from '../../agents/feed/turn-tracker'
import type { WorkClock } from '../../agents/feed/work-clock'
import type { AgentTasks } from './agent-tasks'
import { overSampling } from './api-errors'
import type { AssistantBlocks } from './assistant-blocks'
import { saidInTurn } from './replayed-user'
import type { ServiceRows } from './service-rows'

/** Что концу хода нужно от сборщика ленты: его части, часы, id и обычная отметка. */
export type TurnCloserHost = {
  store: FeedStore
  blocks: AssistantBlocks
  agents: AgentTasks
  service: ServiceRows
  turns: TurnTracker
  work: WorkClock
  now: () => number
  nextId: (prefix: string) => string
  addNotice: (code: NoticeCode, detail?: string, extra?: NoticeExtra) => void
  /** Фон ушёл с процессом: агенты закрыты, оборванные команды - отметками в ленте. */
  release: (reason: ClosedReason, at: number) => void
}

/**
 * Конец хода в ленте: итог с ценой и временем, подпись остановки (человеком или ради
 * переезда на другой аккаунт - как в ACC), незаконченное - закрыто с причиной. Цену
 * хода CLI даёт нарастающим итогом сессии, и новый процесс начинает счёт с нуля.
 */
export class TurnCloser {
  /** Цена сессии из прошлого `result`: CLI присылает её нарастающим итогом. */
  private sessionCost = 0
  /** Кто остановил идущий ход; null - его не останавливали. */
  private stop: StopReason | null = null

  constructor(private readonly host: TurnCloserHost) {}

  /** Новый процесс CLI: его `total_cost_usd` начинается с нуля. */
  startProcess(): void {
    this.sessionCost = 0
  }

  /** Ход остановлен: человеком (Stop) или панелью ради переезда на другой аккаунт. */
  stopped(reason: StopReason): void {
    this.stop = reason
    this.host.service.closeRetry('stopped', this.host.now())
  }

  /**
   * Конец хода по `result`. Рукопожатие свежего процесса сюда не доходит - его отсеивает
   * разговор (conversation/turn-command.ts), а итог локальной команды (/compact, /clear) -
   * такой же ход: со своей ценой и временем. Подпись времени - у хода, которым работа
   * встала, время всего запроса без пауз; у промежуточного (ждём фоновых агентов) - цифра
   * CLI за ход.
   */
  finish(result: CliMessage, interrupted: boolean): void {
    const { host } = this
    const at = host.now()
    const total = numberField(result, 'total_cost_usd')
    const costUsd = Math.max(0, total - this.sessionCost)
    const forAccount = interrupted && this.stop === 'account'

    this.stop = null
    host.service.closeRetryFor(result, at)
    host.service.noteFast(result)
    this.sessionCost = total
    // Фоновые субагенты переживают конец хода: они отчитаются уведомлением.
    this.closeOpenWork(interrupted ? 'stopped' : 'turnEnded', false, at)

    const isError = result['is_error'] === true && !interrupted
    const detail = stringField(result, 'result')

    if (isError && detail) {
      this.noteError(detail, overSampling(numberField(result, 'api_error_status'), detail))
    }

    const workMs = host.agents.hasWork ? null : host.work.elapsed(at)

    host.turns.finish({
      id: host.nextId('turn'),
      durationMs: workMs ?? numberField(result, 'duration_ms'),
      costUsd,
      isError,
      interrupted,
      ...(forAccount && { forAccount: true }),
    })
  }

  /**
   * Ход кончился, а `result` не пришёл: CLI отметил его команду законченной. Незаконченное
   * закрыто; подписи с ценой и временем нет - цифр CLI не дал.
   */
  close(interrupted: boolean): void {
    const at = this.host.now()

    this.stop = null
    this.host.service.closeRetry(interrupted ? 'stopped' : 'failed', at)
    this.closeOpenWork(interrupted ? 'stopped' : 'turnEnded', false, at)
  }

  /**
   * Ход оборвался без `result` (процесс умер или его сняли): незаконченное помечается
   * прерванным, фоновые агенты умерли с процессом. Снятый ради переезда - так и подписан.
   */
  abort(code: NoticeCode, detail: string): void {
    const at = this.host.now()
    const forAccount = code === 'interrupted' && this.stop === 'account'

    this.stop = null
    this.host.service.closeRetry('stopped', at)
    this.closeOpenWork(code === 'interrupted' ? 'stopped' : 'exited', true, at)
    this.host.release('exited', at)
    this.host.addNotice(code, forAccount ? ACCOUNT_STOP : detail)
  }

  /**
   * Ошибка хода - красной строкой, если тех же слов в ходе ещё нет. Отказ из-за параметра
   * выборки помечается и на строке, которую те же слова уже поставили: отказ приходит
   * двумя дорогами, и та, что знает код, не всегда первая (как в ACC).
   */
  private noteError(detail: string, sampling: boolean) {
    const { store } = this.host

    if (!saidInTurn(store.items, detail)) {
      return this.host.addNotice('cli-error', detail, sampling ? { sampling } : {})
    }

    const said = store.items.findLast(
      (item) => item.kind === 'notice' && item.detail.trim() === detail.trim(),
    )

    if (sampling && said) store.update(said.id, 'notice', (item) => ({ ...item, sampling }))
  }

  /** Всё, что ещё пишется или ждёт результата, - закончено без результата, с причиной. */
  closeOpenWork(reason: ClosedReason, withBackground: boolean, at: number): void {
    const { store, agents, blocks } = this.host

    blocks.closeStreaming()

    for (const item of store.items) {
      const isBackground = agents.isBackground(item.id) && !withBackground

      if (item.kind === 'tool' && item.status === 'running' && !isBackground) {
        // Конец оборванного в транскрипте неизвестен: длительности у него нет (конец = начало).
        const endedAt = reason === 'replay' ? item.startedAt : at

        store.put({ ...item, status: 'interrupted', closedReason: reason, endedAt })
      }
    }
  }
}

/** Подробность отметки «прервано», когда ход сняла панель ради переезда на другой аккаунт. */
const ACCOUNT_STOP: StopReason = 'account'

import type { CloudFailure } from '@shared/tracker'

import type { PushRecord } from '@agentic-workstation/cloud-protocol/api'
import {
  MAX_BLOB_LENGTH,
  MAX_PUSH_RECORDS,
  MAX_WAIT_SECONDS,
} from '@agentic-workstation/cloud-protocol/api'

import type { TrackerBook } from '../tracker/tracker-book'
import type { CloudTransport } from './cloud-client'
import { CloudFault } from './cloud-client'

/** Что синхронизируется: книга записей (сейчас - трекер). */
export type SyncCollection = Pick<
  TrackerBook,
  'outgoing' | 'acknowledge' | 'absorb' | 'cursor' | 'pending' | 'rebase' | 'restart'
>

/** Шифр записей ключом аккаунта: сервер видит только blob. */
export type RecordSeal = {
  seal: (id: string, text: string) => string
  open: (id: string, blob: string) => string | null
}

/** Что синхронизация сообщает о себе: окно рисует значок облака. */
export type SyncReport = {
  online: boolean
  failure: CloudFailure | null
  lastSyncAt: number | null
}

export type CloudSyncOptions = {
  collection: SyncCollection
  transport: CloudTransport
  seal: RecordSeal
  onReport: (report: SyncReport) => void
  now?: () => number
  /** Сколько сервер держит забор без перемен; в тестах - 0. */
  waitSeconds?: number
  /** Паузы после сбоя по очереди: дальше последней не растут. */
  backoffMs?: readonly number[]
}

const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const
/** Сколько кругов «записать - забрать спорное - записать» за один заход. */
const MAX_ROUNDS = 5
/** Долгий забор, вернувшийся быстрее этого пустым, - сервер не дал подождать. */
const QUICK_POLL_MS = 1_000
/** Потолок тела одной пачки с запасом под JSON-обёртку. */
const MAX_BATCH_CHARS = 3 * 1024 * 1024

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)

    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })

/** Пачки записей по числу и по размеру. */
const batchesOf = (records: PushRecord[]): PushRecord[][] => {
  const batches: PushRecord[][] = []
  let batch: PushRecord[] = []
  let size = 0

  for (const record of records) {
    if (batch.length >= MAX_PUSH_RECORDS || size + record.blob.length > MAX_BATCH_CHARS) {
      batches.push(batch)
      batch = []
      size = 0
    }

    batch.push(record)
    size += record.blob.length
  }

  if (batch.length > 0) batches.push(batch)

  return batches
}

/**
 * Синхронизация книги с облаком (ADR 0102): забрать всё новое, записать своё, затем ждать
 * перемен долгим забором. Своя правка прерывает ожидание и уходит сразу. Отказ записи (на
 * сервере версия новее) - забрать её, слить по полю и записать снова. Сбой сети - пауза с
 * ростом и новая попытка; данные тем временем живут в книге на диске.
 */
export class CloudSync {
  private running = false
  /** Остановлена навсегда: ни одна запись в книгу после этого не делается. */
  private stopped = false
  /** Жизнь синхронизации: остановка обрывает и идущие запросы, а не только ожидание. */
  private readonly life = new AbortController()
  private wake = new AbortController()
  private finished: Promise<void> = Promise.resolve()
  private failures = 0
  private lastSyncAt: number | null = null
  private readonly now: () => number

  constructor(private readonly options: CloudSyncOptions) {
    this.now = options.now ?? Date.now
  }

  start() {
    if (this.running || this.stopped) return

    this.running = true
    this.finished = this.loop()
  }

  /**
   * Остановить и дождаться конца цикла: смена ключа аккаунта переписывает версии в книге, и
   * ответ старого аккаунта, пришедший после, не должен их затереть.
   */
  stop(): Promise<void> {
    this.stopped = true
    this.running = false
    this.life.abort()
    this.wake.abort()

    return this.finished
  }

  /** Своя правка: прервать ожидание и отправить. */
  kick() {
    this.wake.abort()
  }

  /**
   * Один заход: забрать всё новое, записать своё, пока есть что и пока сервер не спорит.
   * false - сервер спорил все круги подряд: следующий заход - после паузы, а не сразу.
   */
  async syncOnce(): Promise<boolean> {
    const { collection } = this.options
    let settled = true

    await this.pullAll(0)

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const outgoing = this.sealed()

      if (outgoing.length === 0) break

      const disputes = new Map<string, number>()

      settled = false

      for (const batch of batchesOf(outgoing)) {
        const reply = await this.options.transport.push(
          batch.map(({ id, baseRev, blob }) => ({ id, baseRev, blob })),
          this.life.signal,
        )

        this.alive()

        for (const result of reply.results) {
          const sent = outgoing.find((record) => record.id === result.id)

          if (result.ok && sent) collection.acknowledge(result.id, result.rev, sent.text)
          else if (!result.ok) disputes.set(result.id, result.current)
        }
      }

      if (disputes.size === 0) {
        settled = true
        break
      }

      await this.pullAll(0)

      // Версию, которую сервер называет своей и которую забор уже прошёл, эта машина видела и
      // слила - писать поверх неё. Иначе запись, которой на сервере нет, спорила бы вечно.
      for (const [id, current] of disputes) {
        if (current <= collection.cursor) collection.rebase(id, current)
      }
    }

    this.lastSyncAt = this.now()

    return settled
  }

  /** Свои записи шифром; запись больше потолка остаётся дома с предупреждением в журнал. */
  private sealed() {
    return this.options.collection.outgoing().flatMap((record) => {
      const blob = this.options.seal.seal(record.id, record.text)

      if (blob.length > MAX_BLOB_LENGTH) {
        console.warn('[cloud] запись больше потолка, не отправлена', record.id)

        return []
      }

      return [{ id: record.id, baseRev: record.baseRev, blob, text: record.text }]
    })
  }

  /** Остановленная синхронизация в книгу не пишет: ответ пришёл, а аккаунт уже другой. */
  private alive() {
    if (this.stopped) throw new CloudFault('offline')
  }

  /** Забрать всё новое; true - что-то пришло. */
  private async pullAll(wait: number, signal?: AbortSignal): Promise<boolean> {
    const { collection } = this.options
    let restarted = false
    let got = false

    for (;;) {
      const since = collection.cursor
      const page = await this.options.transport.pull(
        since,
        wait,
        signal ? AbortSignal.any([this.life.signal, signal]) : this.life.signal,
      )

      this.alive()

      // Облако позади своего курсора - его подняли из бэкапа: всё своё туда заново, забор с нуля.
      if (page.rev < since && !restarted) {
        console.warn('[cloud] облако позади курсора, синхронизация заново', page.rev, since)
        restarted = true
        collection.restart()

        continue
      }

      const pulled = page.records.flatMap((record) => {
        const text = this.options.seal.open(record.id, record.blob)

        if (text === null) console.warn('[cloud] запись не открылась ключом аккаунта', record.id)

        return text === null ? [] : [{ id: record.id, rev: record.rev, text }]
      })

      collection.absorb(pulled)
      collection.cursor = page.more ? (page.records.at(-1)?.rev ?? page.rev) : page.rev
      got ||= page.records.length > 0

      if (!page.more) return got
    }
  }

  private report(failure: CloudFailure | null, online: boolean) {
    if (!this.stopped) this.options.onReport({ online, failure, lastSyncAt: this.lastSyncAt })
  }

  private async loop() {
    const wait = this.options.waitSeconds ?? MAX_WAIT_SECONDS
    const backoff = this.options.backoffMs ?? BACKOFF_MS

    while (this.running) {
      this.wake = new AbortController()

      try {
        const settled = await this.syncOnce()

        this.failures = 0
        this.report(null, true)

        if (!this.running) break
        if (!settled) {
          await sleep(backoff[0] ?? 0, this.wake.signal)
          continue
        }

        const started = this.now()
        const got = await this.pullAll(wait, this.wake.signal)

        // Сервер не дал подождать (места ожидания заняты): пауза, а не два запроса на круг.
        if (!got && wait > 0 && this.now() - started < QUICK_POLL_MS)
          await sleep(backoff[0] ?? 0, this.wake.signal)
      } catch (error) {
        if (!this.running) break
        if (this.wake.signal.aborted) continue

        const failure = error instanceof CloudFault ? error.failure : 'badReply'

        if (!(error instanceof CloudFault)) console.warn('[cloud] сбой синхронизации', error)

        this.report(failure === 'offline' ? null : failure, false)
        await sleep(backoff[Math.min(this.failures, backoff.length - 1)] ?? 0, this.wake.signal)
        this.failures += 1
      }
    }
  }
}

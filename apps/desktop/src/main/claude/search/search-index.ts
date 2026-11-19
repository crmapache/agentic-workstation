import { stat, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { TitleSource } from '@shared/conversation'

import { stringField, parseCliLine } from '../cli/cli-messages'
import { dropRewound } from '../history/transcript-rewinds'
import { shortenTitle } from '../history/transcript-summary'
import type { Seen, ManifestEntry } from './search-copy'
import {
  readCopy,
  SEEN_ZERO,
  writeCopy,
  appendCopy,
  removeCopy,
  readManifest,
  writeManifest,
} from './search-copy'
import { writeCorpus } from './search-corpus'
import { CORPUS_DIR, REFRESH_INTERVAL_MS } from './search.constants'
import type { Found, SearchOptions, IndexedMessage } from './search.types'
import { TextIndex } from './text-index'
import { readLinesFrom } from './transcript-reader'
import type { BlockCounts } from './transcript-text'
import { readTranscriptLine } from './transcript-text'

/** Транскрипт разговора, который поиску можно читать. */
export type TranscriptFile = { id: string; file: string }

type Conversation = ManifestEntry & {
  id: string
  messages: IndexedMessage[]
  /** Докуда копия на диске догнала транскрипт и номера блоков на тот момент - это и в манифест. */
  kept: Seen
  keptBlocks: BlockCounts
  /** Сколько сообщений лежит в копии: дописывается только хвост за ними. */
  stored: number
  /** Копия отстала (запись упала, откат, чтение с начала) - следующая запись целиком. */
  stale: boolean
  /** В прочитанном встретилась метка отката: отрезанное уйдёт после чтения. */
  rewound: boolean
  /** Номер правки - корпус для модели переписывает только изменённое. */
  revision: number
}

const fresh = (id: string): Conversation => ({
  id,
  messages: [],
  seen: SEEN_ZERO,
  kept: SEEN_ZERO,
  aiTitle: null,
  customTitle: null,
  firstText: '',
  blocks: [],
  keptBlocks: [],
  stored: 0,
  stale: true,
  rewound: false,
  revision: 0,
})

/** Имена строк, которые откат отрезал: CLI их не стирает, а дописывает метку. */
const cutUuids = async (file: string): Promise<Set<string>> => {
  const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean)
  const kept = new Set(dropRewound(lines))
  const cut = new Set<string>()

  for (const line of lines) {
    const uuid = kept.has(line) ? '' : stringField(parseCliLine(line) ?? { type: '' }, 'uuid')

    if (uuid) cut.add(uuid)
  }

  return cut
}

const titleOf = (conversation: Conversation) =>
  conversation.customTitle ?? conversation.aiTitle ?? shortenTitle(conversation.firstText)

const sourceOf = (conversation: Conversation): TitleSource =>
  conversation.customTitle ? 'user' : conversation.aiTitle ? 'llm' : 'heuristic'

/**
 * Всё, что сказали разговоры одного проекта, - там, где поиск достанет это за миг. Транскрипты
 * в сотню раз тяжелее слов в них, поэтому слова вынимаются один раз и держатся в памяти и
 * копией на диске: следующий запуск IDE не читает сотни мегабайт снова. Транскрипт только
 * дописывается - выросший файл читается с места, где чтение остановилось. Отметка «докуда
 * дочитали» в манифесте сдвигается после записи копии, а не до: провалившаяся запись иначе
 * оставила бы сообщения ненайденными навсегда. Копия - кэш: нечитаемая перестраивается молча.
 * Всё под одной очередью: поиск по наполовину обновлённому списку был бы ошибкой, которую
 * никто не повторит.
 */
export class SearchIndex {
  private readonly conversations = new Map<string, Conversation>()
  private readonly index = new TextIndex()
  private readonly corpusWritten = new Map<string, number>()
  private queue: Promise<unknown> = Promise.resolve()
  private loaded = false
  private lastRefresh = Number.NEGATIVE_INFINITY

  constructor(
    private readonly dir: string,
    /** Транскрипты проекта - заново на каждое обновление: новый разговор - новый файл. */
    private readonly transcripts: () => Promise<TranscriptFile[]>,
  ) {}

  /** Обновить по транскриптам (не чаще REFRESH_INTERVAL_MS без force) - true, если что-то поменялось. */
  refresh(force = false, now = Date.now()): Promise<boolean> {
    return this.exclusive(() => this.update(force, now))
  }

  /** Обновить и найти. */
  find(query: string, options: SearchOptions): Promise<Found> {
    return this.exclusive(async () => {
      await this.update(false, Date.now())

      return this.index.search(query, options)
    })
  }

  /** Сообщение по имени - так находка модели становится находкой: выдуманный uuid никуда не ведёт. */
  lookup(conversation: string, uuid: string): IndexedMessage | null {
    return this.conversations.get(conversation)?.messages.find((item) => item.uuid === uuid) ?? null
  }

  /** Имя разговора, чьё оно и сколько в нём сообщений - заголовок группы в списке. */
  describe(id: string): { title: string; titleSource: TitleSource; messages: number } {
    const conversation = this.conversations.get(id)

    return conversation
      ? {
          title: titleOf(conversation),
          titleSource: sourceOf(conversation),
          messages: conversation.messages.length,
        }
      : { title: '', titleSource: 'heuristic', messages: 0 }
  }

  /** Обновить и выписать корпус для модели; ответ - его папка. */
  corpus(): Promise<string> {
    return this.exclusive(async () => {
      await this.update(true, Date.now())

      const folder = join(this.dir, CORPUS_DIR)
      const list = [...this.conversations.values()].map((item) => ({
        ...item,
        title: titleOf(item),
      }))

      await writeCorpus(folder, list, this.corpusWritten)

      return folder
    })
  }

  /** Сколько сообщений в индексе - для тестов, не слова. */
  get size(): number {
    return this.index.size
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work)

    this.queue = run.catch(() => undefined)

    return run
  }

  private async update(force: boolean, now: number): Promise<boolean> {
    await this.load()

    if (!force && now - this.lastRefresh < REFRESH_INTERVAL_MS) return false

    this.lastRefresh = now

    let changed = false
    let manifestDue = false
    const present = new Set<string>()

    for (const { id, file } of await this.transcripts()) {
      present.add(id)

      const info = await stat(file).catch(() => null)
      const known = this.conversations.get(id)

      if (!info) continue

      if (known && known.seen.size === info.size && known.seen.modified === info.mtimeMs) {
        // В транскрипте нового нет, но копия на диске может быть ещё должна запись.
        if (known.stale && (await this.keep(known))) manifestDue = true

        continue
      }

      await this.read(known ?? fresh(id), file, { size: info.size, modified: info.mtimeMs })
      changed = true
    }

    for (const id of [...this.conversations.keys()].filter((key) => !present.has(key))) {
      this.conversations.delete(id)
      this.index.removeConversation(id)
      await removeCopy(this.dir, id).catch(() => undefined)
      changed = true
    }

    if (changed || manifestDue) await this.storeManifest()

    return changed
  }

  /** Прочитать новое в транскрипте; файл не вырос, а стал другим - читать с начала. */
  private async read(
    conversation: Conversation,
    file: string,
    stamp: { size: number; modified: number },
  ) {
    const { id } = conversation
    const appended =
      this.conversations.has(id) &&
      conversation.seen.offset > 0 &&
      stamp.size >= conversation.seen.offset

    if (!appended) {
      Object.assign(conversation, { ...fresh(id), revision: conversation.revision })
      this.index.removeConversation(id)
    }

    const before = conversation.messages.length
    const from = conversation.seen.offset
    const offset = await readLinesFrom(file, from, (line) => this.take(conversation, line)).catch(
      (error: unknown) => {
        console.warn('[claude-search] транскрипт не прочитан:', id, error)

        return from
      },
    )

    conversation.seen = { ...stamp, offset }
    conversation.revision += 1
    this.conversations.set(id, conversation)

    if (conversation.rewound) {
      // Отрезанное откатом лежит в файле - найденное в нём открыло бы разговор на словах, которых там нет.
      conversation.rewound = false

      const cut = await cutUuids(file).catch(() => new Set<string>())

      conversation.messages = conversation.messages.filter((message) => !cut.has(message.uuid))
      conversation.stale = true
      this.index.removeConversation(id)
      this.index.add(conversation.messages)
    } else {
      this.index.add(conversation.messages.slice(before))
    }

    await this.keep(conversation)
  }

  private take(conversation: Conversation, line: string) {
    const found = readTranscriptLine(conversation.id, line, conversation.blocks)

    if (!found) return

    if (found.kind === 'rewind') conversation.rewound = true
    else if (found.kind === 'aiTitle') conversation.aiTitle = found.title || conversation.aiTitle
    else if (found.kind === 'customTitle') conversation.customTitle = found.title || null
    else {
      conversation.messages.push(found.message)

      if (found.message.speaker === 'you' && !conversation.firstText)
        conversation.firstText = found.message.text
    }
  }

  /** Записать слова в копию и только потом сказать, что копия их держит. */
  private async keep(conversation: Conversation): Promise<boolean> {
    try {
      const whole = conversation.stale || conversation.stored > conversation.messages.length

      if (whole) await writeCopy(this.dir, conversation.id, conversation.messages)
      else
        await appendCopy(
          this.dir,
          conversation.id,
          conversation.messages.slice(conversation.stored),
        )

      conversation.stored = conversation.messages.length
      conversation.kept = conversation.seen
      conversation.keptBlocks = conversation.blocks.map(([id, count]) => [id, count])
      conversation.stale = false

      return true
    } catch (error) {
      console.warn('[claude-search] копия индекса не записана:', conversation.id, error)
      conversation.stale = true

      return false
    }
  }

  private async storeManifest() {
    const entries = new Map(
      [...this.conversations.values()].map((item) => [
        item.id,
        { ...item, seen: item.kept, blocks: item.keptBlocks } satisfies ManifestEntry,
      ]),
    )

    await writeManifest(this.dir, entries).catch((error: unknown) =>
      console.warn('[claude-search] манифест индекса не записан:', error),
    )
  }

  /** Копия с диска - один раз; нечитаемая копия разговора читается заново из транскрипта. */
  private async load() {
    if (this.loaded) return

    this.loaded = true

    for (const [id, entry] of (await readManifest(this.dir)) ?? []) {
      const messages = await readCopy(this.dir, id)
      const conversation: Conversation = messages
        ? {
            ...fresh(id),
            ...entry,
            messages,
            kept: entry.seen,
            keptBlocks: entry.blocks,
            stored: messages.length,
            stale: false,
          }
        : fresh(id)

      conversation.blocks = conversation.blocks.map(([key, count]) => [key, count])
      this.conversations.set(id, conversation)
      this.index.add(conversation.messages)
    }
  }
}

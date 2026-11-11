import type { FeedItem, FeedPatch, TaskEntry } from '@shared/claude-feed'

import type { FeedPatchMessage } from '@agentic-workstation/remote-protocol/agent-messages'

/** Потолок журнала одного разговора: заплаток и байт. Дальше телефон получит снимок. */
export const MAX_ENTRIES = 400

export const MAX_BYTES = 2 * 1024 * 1024

type Entry = { message: FeedPatchMessage; bytes: number }

/**
 * Журнал ленты разговора с номерами: каждая заплатка, ушедшая телефонам, получает номер, и
 * вернувшийся телефон догоняет с номера, который у него есть. Журнал держит хвост; телефону,
 * отставшему дальше хвоста, - снимок, а не дыра.
 */
export class FeedJournal {
  private entries: Entry[] = []
  private next = 1
  private bytes = 0

  constructor(
    private readonly maxEntries = MAX_ENTRIES,
    private readonly maxBytes = MAX_BYTES,
  ) {}

  get lastSeq(): number {
    return this.next - 1
  }

  /** Записать заплатку под следующим номером; build получает номер и строит сообщение. */
  append(build: (seq: number) => FeedPatchMessage, bytes: number): FeedPatchMessage {
    const message = build(this.next)

    this.next += 1
    this.entries.push({ message, bytes })
    this.bytes += bytes

    while (
      this.entries.length > this.maxEntries ||
      (this.bytes > this.maxBytes && this.entries.length > 1)
    ) {
      this.bytes -= this.entries.shift()?.bytes ?? 0
    }

    return message
  }

  /** Заплатки после since; null - журнал их уже не держит или номер не отсюда: нужен снимок. */
  after(since: number): FeedPatchMessage[] | null {
    if (since > this.lastSeq) return null

    const first = this.entries[0]?.message.seq ?? this.next

    if (since < first - 1) return null

    return this.entries.filter((entry) => entry.message.seq > since).map((entry) => entry.message)
  }
}

/** Заплатки за короткое окно - одной: поток модели меняет ответ на каждую пачку букв. */
export type FoldedPatch = {
  upserts: Map<string, FeedItem>
  removes: Set<string>
  tasks: TaskEntry[] | undefined
  hasEarlier: boolean | undefined
}

export const emptyFold = (): FoldedPatch => ({
  upserts: new Map(),
  removes: new Set(),
  tasks: undefined,
  hasEarlier: undefined,
})

/**
 * Сложить заплатку в накопленную так, чтобы применение итога дало то же, что применение по
 * очереди (снятие - раньше вставки, как у applyFeedPatch окна): снятый элемент теряет свою
 * вставку, а вставленный после снятия встаёт в конец ленты.
 */
export const foldPatch = (into: FoldedPatch, patch: FeedPatch): FoldedPatch => {
  for (const id of patch.removes ?? []) {
    into.upserts.delete(id)
    into.removes.add(id)
  }

  for (const item of patch.upserts) into.upserts.set(item.id, item)

  if (patch.tasks) into.tasks = patch.tasks
  if (patch.hasEarlier !== undefined) into.hasEarlier = patch.hasEarlier

  return into
}

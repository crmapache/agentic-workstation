import { isRecord, numberField, recordField, stringField } from '../cli/cli-messages'
import type { FeedStore } from '../../agents/feed/feed-store'
import { EMPTY_TEXT_PLACEHOLDER } from './feed.constants'
import { claudeToolAction } from './tool-action'

type BlockKind = 'text' | 'thinking' | 'tool'

/** Блок ответа, начатый потоком: ждёт готового сообщения, которое его подтвердит. */
type StreamBlock = { itemId: string; kind: BlockKind; confirmed: boolean }

const blockKind = (type: string): BlockKind | null => {
  if (type === 'text') return 'text'
  if (type === 'thinking' || type === 'redacted_thinking') return 'thinking'
  if (type === 'tool_use' || type === 'server_tool_use') return 'tool'

  return null
}

/**
 * Ответ модели приходит двумя путями: частями потока (`stream_event`, по буквам) и
 * готовым сообщением на каждый блок (`assistant`). Готовое приходит раньше, чем поток
 * закроет блок, и несёт свой порядковый номер 0 - номера блоков потока в нём нет.
 * Поэтому готовый блок подтверждает первый неподтверждённый блок того же вида в том
 * же сообщении, а не блок с тем же номером. Без потока (транскрипт, субагент) готовый
 * блок просто встаёт в ленту.
 */
export class AssistantBlocks {
  private readonly streamed = new Map<string, StreamBlock[]>()
  private readonly byIndex = new Map<number, StreamBlock>()
  /**
   * Сколько блоков сообщения уже пришло готовыми: номер блока - часть его id. Поток
   * называет блок номером в сообщении, и готовые блоки, посчитанные по порядку, получают
   * те же номера: у ответа один id вживую и в транскрипте, и закреплённое переживает
   * перезапуск.
   */
  private readonly blockCounts = new Map<string, number>()
  private messageId: string | null = null
  /** Блоки сообщений без id (так бывает у служебных): им - сквозной номер. */
  private anonymous = 0

  constructor(private readonly store: FeedStore) {}

  /** Событие потока основного разговора (не субагента). at - когда оно пришло. */
  applyStreamEvent(event: Record<string, unknown>, at: number): void {
    const type = stringField(event, 'type')

    if (type === 'message_start') {
      this.messageId = stringField(recordField(event, 'message'), 'id') || null
      this.byIndex.clear()
    } else if (type === 'content_block_start') {
      this.startBlock(numberField(event, 'index'), recordField(event, 'content_block'), at)
    } else if (type === 'content_block_delta') {
      this.applyDelta(numberField(event, 'index'), recordField(event, 'delta'))
    } else if (type === 'content_block_stop') {
      this.stopBlock(numberField(event, 'index'))
    }
  }

  /**
   * Готовое сообщение модели. parentToolUseId - вызов субагента или null; at - момент
   * строки (у транскрипта - её время).
   */
  applyMessage(message: Record<string, unknown>, parentToolUseId: string | null, at: number): void {
    const messageId = stringField(message, 'id')
    const content = message['content']

    if (!Array.isArray(content)) return

    for (const block of content.filter(isRecord)) {
      const kind = blockKind(stringField(block, 'type'))
      const index = this.blockCounts.get(messageId) ?? 0

      this.blockCounts.set(messageId, index + 1)

      if (kind === 'tool') this.putTool(block, parentToolUseId, at)
      else if (kind) this.putText(kind, messageId, index, block, parentToolUseId)
    }
  }

  /** CLI оценил размышление в токенах: дописать открытому блоку размышления. */
  noteThinkingTokens(tokens: number): void {
    const open = [...this.byIndex.values()].findLast((block) => block.kind === 'thinking')

    if (open) this.store.update(open.itemId, 'thinking', (item) => ({ ...item, tokens }))
  }

  /** Ход кончился или прерван: всё, что ещё «пишется», больше не пишется. */
  closeStreaming(): void {
    for (const blocks of this.streamed.values()) for (const block of blocks) this.markStopped(block)

    this.byIndex.clear()
    this.streamed.clear()
    this.messageId = null
  }

  /** Лента стёрта (/clear): счёт блоков начинается заново. */
  reset(): void {
    this.closeStreaming()
    this.blockCounts.clear()
  }

  private startBlock(index: number, block: Record<string, unknown>, at: number) {
    const kind = blockKind(stringField(block, 'type'))

    if (!kind || !this.messageId) return

    const itemId = kind === 'tool' ? stringField(block, 'id') : `${this.messageId}:${index}`
    const entry: StreamBlock = { itemId, kind, confirmed: false }

    this.byIndex.set(index, entry)
    this.streamed.set(this.messageId, [...(this.streamed.get(this.messageId) ?? []), entry])

    if (kind === 'tool') return this.putTool(block, null, at)

    this.store.put(
      kind === 'text'
        ? { kind: 'assistant', id: itemId, parentToolUseId: null, text: '', streaming: true }
        : {
            kind: 'thinking',
            id: itemId,
            parentToolUseId: null,
            text: '',
            streaming: true,
            tokens: 0,
          },
    )
  }

  private applyDelta(index: number, delta: Record<string, unknown>) {
    const block = this.byIndex.get(index)

    if (!block) return

    const type = stringField(delta, 'type')

    if (type === 'text_delta') {
      const text = stringField(delta, 'text')

      this.store.update(block.itemId, 'assistant', (item) => ({ ...item, text: item.text + text }))
    } else if (type === 'thinking_delta') {
      const text = stringField(delta, 'thinking')
      const tokens = numberField(delta, 'estimated_tokens')

      this.store.update(block.itemId, 'thinking', (item) => ({
        ...item,
        text: item.text + text,
        tokens: tokens || item.tokens,
      }))
    }
  }

  private stopBlock(index: number) {
    const block = this.byIndex.get(index)

    this.byIndex.delete(index)

    if (block) this.markStopped(block)
  }

  private markStopped(block: StreamBlock) {
    const item = this.store.get(block.itemId)

    if ((item?.kind === 'assistant' || item?.kind === 'thinking') && item.streaming) {
      this.store.put({ ...item, streaming: false })
    }
  }

  private putText(
    kind: 'text' | 'thinking',
    messageId: string,
    index: number,
    block: Record<string, unknown>,
    parentToolUseId: string | null,
  ) {
    const text = stringField(block, kind === 'text' ? 'text' : 'thinking')

    if (kind === 'text' && (text.trim() === EMPTY_TEXT_PLACEHOLDER || !text.trim())) return

    const pending = parentToolUseId
      ? undefined
      : this.streamed.get(messageId)?.find((entry) => entry.kind === kind && !entry.confirmed)

    // Скрытое размышление из транскрипта: ни текста, ни счёта токенов - показывать нечего.
    if (kind === 'thinking' && !text && !pending) return
    if (pending) pending.confirmed = true

    const id =
      pending?.itemId ?? (messageId ? `${messageId}:${index}` : `message:${this.anonymous++}`)
    const existing = this.store.get(id)
    const tokens = existing?.kind === 'thinking' ? existing.tokens : 0

    this.store.put(
      kind === 'text'
        ? { kind: 'assistant', id, parentToolUseId, text, streaming: false }
        : { kind: 'thinking', id, parentToolUseId, text, streaming: false, tokens },
    )
  }

  private putTool(block: Record<string, unknown>, parentToolUseId: string | null, at: number) {
    const id = stringField(block, 'id')

    if (!id) return

    const existing = this.store.get(id)
    const input = recordField(block, 'input')

    if (existing?.kind === 'tool') {
      const latest = Object.keys(input).length > 0 ? input : existing.input

      this.store.put({
        ...existing,
        input: latest,
        action: claudeToolAction(existing.name, latest),
        parentToolUseId: existing.parentToolUseId ?? parentToolUseId,
      })
    } else {
      const name = stringField(block, 'name')

      this.store.put({
        kind: 'tool',
        id,
        parentToolUseId,
        name,
        input,
        action: claudeToolAction(name, input),
        status: 'running',
        result: null,
        startedAt: at,
        endedAt: 0,
        closedReason: null,
      })
    }
  }
}

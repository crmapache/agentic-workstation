import type { AcpToolId, AcpToolLens, AcpToolView } from '../../acp/feed/acp-feed-builder'
import { inputOf, acpToolAction, mergeToolCall } from '../../acp/feed/acp-tools'
import type { AcpToolCall, AcpToolKind } from '../../acp/protocol/acp-types'

const text = (input: Record<string, unknown>, key: string): string => {
  const value = input[key]

  return typeof value === 'string' ? value : ''
}

/** Короткий вход вызова для журнала: команда, путь, адрес - или JSON до сотни знаков. */
export const inputLine = (input: Record<string, unknown>): string =>
  text(input, 'command') ||
  text(input, 'path') ||
  text(input, 'file_path') ||
  text(input, 'url') ||
  JSON.stringify(input).slice(0, 100)

/** Вызов хода: что о нём пришло и имя инструмента из первого сообщения о нём. */
type Known = { call: AcpToolCall; name: string }

/**
 * Вызовы хода прогона ACP - вопросу разрешения и журналу сессии. У Kimi в вопросе нет `kind`, а
 * вход приходит позже вопроса: вызов берётся из прошлых обновлений по устойчивой части id. Разбор
 * тот же, что у ленты панели (AcpFeedBuilder): имя - из первого сообщения (у Kimi `title` потом
 * становится описанием), поля обновлений сливаются, своё агента уточняет lens. Ленты здесь нет:
 * прогону без вкладки она не нужна, а копилась бы весь прогон.
 */
export class AcpRunCalls {
  private readonly known = new Map<string, Known>()

  constructor(
    private readonly lens: AcpToolLens,
    private readonly toolId: AcpToolId,
  ) {}

  /** Обновление вызова; первое о нём - его вид для журнала, следующие - null. */
  update(update: AcpToolCall): AcpToolView | null {
    const id = this.toolId(update.toolCallId)
    const before = this.known.get(id)
    const call = mergeToolCall(before?.call, update)
    const name =
      typeof call['name'] === 'string' ? call['name'] : before?.name || (call.title ?? '')

    this.known.set(id, { call, name })

    return before ? null : this.view(update.toolCallId)
  }

  /** Вид вызова: имя, вход, действие; не знаем такого - null. */
  view(toolCallId: string): AcpToolView | null {
    const known = this.known.get(this.toolId(toolCallId))

    if (!known) return null

    const { call, name } = known

    return this.lens(call, { name, input: inputOf(call), action: acpToolAction(call) })
  }

  /** Вид ACP вызова (`edit`, `delete`, `move`...): по нему запись узнаётся и без диффа. */
  kind(toolCallId: string): AcpToolKind | null {
    return this.known.get(this.toolId(toolCallId))?.call.kind ?? null
  }

  /** Ход кончился: о его вызовах больше не спросят. */
  clear(): void {
    this.known.clear()
  }
}

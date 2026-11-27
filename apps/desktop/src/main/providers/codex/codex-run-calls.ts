import { pickMcpCall, mcpCandidateOf } from '../../codex/conversation/codex-mcp-approval'
import type { CallLookup } from '../../codex/conversation/codex-requests'
import type { CodexItem } from '../../codex/feed/codex-tools'
import { toolItemsOf } from '../../codex/feed/codex-tools'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Вызов элемента, как его нарисовала бы лента; не вызов - null. */
const toolOf = (item: CodexItem) =>
  toolItemsOf(item, { parent: null, startedAt: 0, endedAt: 0 })[0] ?? null

/**
 * Идущие вызовы прогона Codex: у прогона нет ленты панели, а вопрос сервера называет вызов id
 * элемента (команда, правка) или не называет вовсе (одобрение MCP, ADR 0131). Кончившийся
 * вызов ни о чём уже не спросит и уходит из учёта.
 */
export class CodexRunCalls {
  private readonly items = new Map<string, CodexItem>()

  /** Уведомление сервера: начатый элемент - в учёт, кончившийся - из него. */
  notify(method: string, body: Record<string, unknown>): void {
    const item = body['item']

    if (!isRecord(item) || typeof item['id'] !== 'string') return
    if (method === 'item/started' && typeof item['type'] === 'string') {
      this.items.set(item['id'], item as CodexItem)
    }
    if (method === 'item/completed') this.items.delete(item['id'])
  }

  /** Вызовы для вопроса сервера (`holdServerRequest`). */
  readonly lookup: CallLookup = {
    facts: (itemId) => {
      const item = this.items.get(itemId)
      const tool = item ? toolOf(item) : null

      return tool
        ? { name: tool.name, input: tool.input, action: tool.action }
        : { name: 'apply_patch', input: {}, action: { kind: 'other', target: '', path: '' } }
    },
    mcpCall: (ask) =>
      pickMcpCall(
        [...this.items.values()].flatMap((item) => {
          const tool = item.type === 'mcpToolCall' ? toolOf(item) : null
          const candidate = tool ? mcpCandidateOf(tool) : null

          return candidate ? [candidate] : []
        }),
        ask,
      ),
  }
}

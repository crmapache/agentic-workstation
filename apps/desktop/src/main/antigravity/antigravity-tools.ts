import type { ToolAction } from '@shared/conversation-feed'

import type { AcpToolLens } from '../acp/feed/acp-feed-builder'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Вызов коннектора у `agy`: имя `mcp_<сервер>_<инструмент>` (ADR 0092). Сервер ищется среди
 * серверов процесса - сначала длинные имена: у `notifications` и `notifications-work` общее
 * начало.
 */
export const mcpOf = (name: string, servers: readonly string[]): ToolAction | null => {
  if (!name.startsWith('mcp_')) return null

  const server = [...servers]
    .sort((a, b) => b.length - a.length)
    .find((one) => name.startsWith(`mcp_${one}_`))

  return server
    ? { kind: 'mcp', server, tool: name.slice(`mcp_${server}_`.length), target: '', path: '' }
    : null
}

/**
 * Артефакт Antigravity (план, отчёт, список задач): запись файла с `ArtifactMetadata` во входе.
 * Карточка - записью файла артефакта с его описанием.
 */
const artifactOf = (input: Record<string, unknown>, base: ToolAction): ToolAction | null => {
  const meta = input['ArtifactMetadata']

  if (!isRecord(meta) || (base.kind !== 'write' && base.kind !== 'edit')) return null

  return {
    kind: 'artifact',
    path: base.path,
    summary: typeof meta['Summary'] === 'string' ? meta['Summary'] : '',
    review: meta['RequestFeedback'] === true,
  }
}

/**
 * Своё `agy` о вызовах: имя инструмента в поле `name` (`read_file`, `run_command`,
 * `ask_question`, `mcp_<сервер>_<инструмент>`), коннекторы IDE, вопрос человеку, артефакт.
 */
export const antigravityLens =
  (servers: readonly string[]): AcpToolLens =>
  (_call, base) => {
    const mcp = mcpOf(base.name, servers)

    if (mcp) return { ...base, action: mcp }
    if (base.name === 'ask_question')
      return { ...base, action: { kind: 'question', questions: [] } }

    const artifact = artifactOf(base.input, base.action)

    return artifact ? { ...base, action: artifact } : base
  }

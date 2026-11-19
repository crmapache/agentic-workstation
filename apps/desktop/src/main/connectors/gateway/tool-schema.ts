import type { Tool } from '@modelcontextprotocol/sdk/types.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Схема входа инструмента, которую примет любой провайдер: у списка без `items` - `items: {}`
 * («элементы любые»). По JSON Schema это то же самое, а Gemini (Antigravity, ADR 0092) без поля
 * отвечает 400 на весь запрос - и один такой инструмент любого коннектора ломал бы разговор
 * целиком (замерено на `agy` 1.5.12: `items: {}` Gemini принимает). Остальное не трогается.
 */
export const portableSchema = (schema: unknown): unknown => {
  if (Array.isArray(schema)) return schema.map(portableSchema)
  if (!isRecord(schema)) return schema

  const fixed = Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, portableSchema(value)]),
  )
  const isArray =
    fixed['type'] === 'array' || (Array.isArray(fixed['type']) && fixed['type'].includes('array'))

  return isArray && !('items' in fixed) && !('prefixItems' in fixed)
    ? { ...fixed, items: {} }
    : fixed
}

/** Инструменты шлюза - со схемами, которые примет любой провайдер. */
export const portableTools = (tools: readonly Tool[]): Tool[] =>
  tools.map((tool) => ({
    ...tool,
    inputSchema: portableSchema(tool.inputSchema) as Tool['inputSchema'],
  }))

/** Строка журнала - объект с полями. */
export type Json = Record<string, unknown>

/** Строка журнала JSONL объектом; битая - null (строку дописывают прямо сейчас). */
export const jsonOf = (raw: Buffer): Json | null => {
  try {
    const value: unknown = JSON.parse(raw.toString('utf8'))

    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Json)
      : null
  } catch {
    return null
  }
}

export const numberOf = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

export const textOf = (value: unknown): string => (typeof value === 'string' ? value : '')

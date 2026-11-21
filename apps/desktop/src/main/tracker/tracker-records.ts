/**
 * Запись трекера - то, что уходит в облако одним шифром: вид и поля, у каждого поля своя
 * отметка часов (tracker-clock.ts). Слияние - по полю: правка заголовка на одном компьютере и
 * перенос той же карточки на другом не затирают друг друга. Удаление - тоже поле (`deleted`):
 * удалённая запись остаётся отметкой, чтобы другой компьютер не вернул её своей старой копией.
 */

export type RecordKind = 'space' | 'project' | 'flow' | 'group' | 'card'

export const RECORD_KINDS: readonly RecordKind[] = ['space', 'project', 'flow', 'group', 'card']

/** Поле: значение и отметка часов правки. */
export type RecordField = [value: unknown, stamp: string]

export type TrackerRecord = { id: string; kind: RecordKind; fields: Record<string, RecordField> }

const isKind = (value: unknown): value is RecordKind =>
  typeof value === 'string' && (RECORD_KINDS as readonly string[]).includes(value)

const isField = (value: unknown): value is RecordField =>
  Array.isArray(value) && value.length === 2 && typeof value[1] === 'string'

/** Поля из разобранного JSON: битое поле пропускается, а не ломает запись. */
export const fieldsOf = (value: unknown): Record<string, RecordField> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const fields: Record<string, RecordField> = {}

  for (const [name, field] of Object.entries(value)) {
    if (isField(field)) fields[name] = [field[0], field[1]]
  }

  return fields
}

/** Текст записи для шифра: вид и поля. */
export const encodeRecord = (record: TrackerRecord): string =>
  JSON.stringify({ k: record.kind, f: record.fields })

/** Запись из текста шифра; null - не запись трекера. */
export const decodeRecord = (id: string, text: string): TrackerRecord | null => {
  try {
    const parsed = JSON.parse(text) as { k?: unknown; f?: unknown }

    return isKind(parsed.k) ? { id, kind: parsed.k, fields: fieldsOf(parsed.f) } : null
  } catch {
    return null
  }
}

/** Равные отметки бывают только у одной правки; на всякий случай решает текст значения. */
const later = (a: RecordField, b: RecordField): RecordField => {
  if (a[1] !== b[1]) return a[1] > b[1] ? a : b

  return JSON.stringify(a[0]) >= JSON.stringify(b[0]) ? a : b
}

/** Слияние двух копий одной записи: каждое поле - с поздней отметкой. */
export const mergeRecords = (local: TrackerRecord, remote: TrackerRecord): TrackerRecord => {
  const fields: Record<string, RecordField> = { ...remote.fields }

  for (const [name, field] of Object.entries(local.fields)) {
    const other = fields[name]

    fields[name] = other ? later(field, other) : field
  }

  return { id: local.id, kind: remote.kind, fields }
}

/** Одинаковы ли поля двух копий (порядок полей не важен). */
export const sameFields = (a: TrackerRecord, b: TrackerRecord): boolean => {
  const names = Object.keys(a.fields)

  if (names.length !== Object.keys(b.fields).length) return false

  return names.every((name) => {
    const left = a.fields[name]
    const right = b.fields[name]

    return (
      right !== undefined &&
      left?.[1] === right[1] &&
      JSON.stringify(left[0]) === JSON.stringify(right[0])
    )
  })
}

/** Все отметки записи: часы учитывают их, чтобы своя следующая правка была позже. */
export const stampsOf = (record: TrackerRecord): string[] =>
  Object.values(record.fields).map((field) => field[1])

/** Значение поля как есть. */
export const valueOf = (record: TrackerRecord, name: string): unknown => record.fields[name]?.[0]

export const textOf = (record: TrackerRecord, name: string): string => {
  const value = valueOf(record, name)

  return typeof value === 'string' ? value : ''
}

/** id-ссылка (родитель, пространство): пустая строка и не строка - null. */
export const refOf = (record: TrackerRecord, name: string): string | null => {
  const value = valueOf(record, name)

  return typeof value === 'string' && value ? value : null
}

export const numberOf = (record: TrackerRecord, name: string): number | null => {
  const value = valueOf(record, name)

  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export const flagOf = (record: TrackerRecord, name: string): boolean =>
  valueOf(record, name) === true

/** Жива ли запись: удалённая остаётся отметкой и в доску не попадает. */
export const isAlive = (record: TrackerRecord | undefined): record is TrackerRecord =>
  record !== undefined && !flagOf(record, 'deleted')

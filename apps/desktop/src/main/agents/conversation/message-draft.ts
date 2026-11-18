import type { ImageAttachment } from '@shared/claude'
import type { ChipKind, DraftChip, EditorRef, DraftToken, MessageDraft } from '@shared/claude-draft'
import { CHIP_KINDS } from '@shared/claude-draft'

/**
 * Куски сообщения (чипы и цитаты) из окна или с диска. Не верим ни тому, ни другому:
 * черновик писала другая версия панели, а окно - чужой процесс. Что не сходится по
 * форме - выбрасывается, а не роняет очередь. Байты картинок в куски не попадают: их
 * держит outbox в памяти, а очередь хранится на диске.
 */

/** Потолки: черновик - не файл, а лишнее не должно доехать до диска и ленты. */
const MAX_TOKENS = 2_000
const MAX_QUOTES = 50
const MAX_FIELD_CHARS = 200_000
const MAX_PATH_CHARS = 4_096

/** Подпись вставленной картинки - та же «Image #N», что видит модель в тексте. */
const PASTED_CAPTION = /^Image #\d+$/

const text = (value: unknown, max = MAX_FIELD_CHARS): string | undefined =>
  typeof value === 'string' && value.length <= max ? value : undefined

const isChipKind = (value: unknown): value is ChipKind => CHIP_KINDS.some((kind) => kind === value)

const chipOf = (raw: unknown): DraftChip | null => {
  if (typeof raw !== 'object' || raw === null) return null

  const record = raw as Record<string, unknown>
  const value = text(record['value'], MAX_PATH_CHARS)

  if (!isChipKind(record['kind']) || value === undefined) return null

  const chip: DraftChip = { kind: record['kind'], value }
  const range = text(record['range'], 40)
  const path = text(record['path'], MAX_PATH_CHARS)
  const body = text(record['text'])

  if (range !== undefined) chip.range = range
  if (path !== undefined) chip.path = path
  if (body !== undefined) chip.text = body

  return chip
}

const tokenOf = (raw: unknown): DraftToken | null => {
  if (typeof raw !== 'object' || raw === null) return null

  const record = raw as Record<string, unknown>

  if (record['kind'] === 'text') {
    const value = text(record['value'])

    return value === undefined ? null : { kind: 'text', value }
  }

  const chip = record['kind'] === 'chip' ? chipOf(record['chip']) : null

  return chip ? { kind: 'chip', chip } : null
}

/** Куски сообщения - без байтов картинок; null - кусков нет или они не той формы. */
export const parseMessageDraft = (raw: unknown): MessageDraft | null => {
  if (typeof raw !== 'object' || raw === null) return null

  const record = raw as Record<string, unknown>
  const tokens = Array.isArray(record['tokens'])
    ? record['tokens'].slice(0, MAX_TOKENS).map(tokenOf)
    : []
  const quotes = Array.isArray(record['quotes'])
    ? record['quotes'].slice(0, MAX_QUOTES).map((quote) => text(quote))
    : []
  const goodTokens = tokens.filter((token): token is DraftToken => token !== null)
  const goodQuotes = quotes.filter((quote): quote is string => quote !== undefined)

  return goodTokens.length > 0 || goodQuotes.length > 0
    ? { tokens: goodTokens, quotes: goodQuotes }
    : null
}

/** Номер строки: целое от единицы. */
const lineOf = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined

/**
 * Что было открыто в редакторе. Путь идёт в заметку модели - без перевода строки, иначе
 * заметка читалась бы обратно не тем файлом.
 */
export const parseEditorRef = (raw: unknown): EditorRef | null => {
  if (typeof raw !== 'object' || raw === null) return null

  const record = raw as Record<string, unknown>
  const path = text(record['path'], MAX_PATH_CHARS)
  const name = text(record['name'], MAX_PATH_CHARS)

  if (!path || !name || /[\r\n]/.test(path)) return null

  const from = lineOf(record['from'])
  const to = lineOf(record['to'])
  const selected = text(record['text'])
  const lines = from !== undefined && to !== undefined && from <= to ? { from, to } : {}

  return {
    path,
    name,
    ...lines,
    ...(selected !== undefined && lines.from ? { text: selected } : {}),
  }
}

/** Вставленная картинка: её байты едут вложением, а чип несёт только подпись. */
export const isPastedImage = (chip: DraftChip): boolean =>
  chip.kind === 'img' && PASTED_CAPTION.test(chip.value)

/**
 * Куски вынутого из очереди сообщения с байтами картинок обратно в чипах: k-я
 * вставленная картинка - k-е вложение. Байтов не осталось (очередь пережила перезапуск) -
 * картинка возвращается файлом, куда её записали, а без файла выбрасывается.
 */
export const withImageData = (
  draft: MessageDraft,
  images: readonly ImageAttachment[],
): MessageDraft => {
  let next = 0
  const tokens = draft.tokens.flatMap((token): DraftToken[] => {
    if (token.kind !== 'chip' || !isPastedImage(token.chip)) return [token]

    const image = images[next]

    next += 1

    if (image) {
      return [
        {
          kind: 'chip',
          chip: { ...token.chip, data: `data:${image.mediaType};base64,${image.data}` },
        },
      ]
    }

    return token.chip.path ? [{ kind: 'chip', chip: { kind: 'img', value: token.chip.path } }] : []
  })

  return { ...draft, tokens }
}

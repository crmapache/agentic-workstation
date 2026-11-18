import type { PatchHunk, ToolFeedItem } from '@shared/claude-feed'

/** Строка диффа для отрисовки: добавлена, удалена, контекст или разрыв между кусками. */
export type DiffRow = {
  kind: 'add' | 'del' | 'ctx' | 'gap'
  text: string
  /** Номер строки в файле после правки (у удалённой - до правки). null - не знаем. */
  line: number | null
}

/** Строки диффа из кусков: номера идут от начала каждого куска. */
export const rowsFromPatch = (hunks: readonly PatchHunk[], numbered: boolean): DiffRow[] => {
  const rows: DiffRow[] = []

  hunks.forEach((hunk, index) => {
    if (index > 0) rows.push({ kind: 'gap', text: '', line: null })

    let oldLine = hunk.oldStart
    let newLine = hunk.newStart

    for (const raw of hunk.lines) {
      const sign = raw[0]
      const text = raw.slice(1)

      if (sign === '+') {
        rows.push({ kind: 'add', text, line: numbered ? newLine : null })
        newLine += 1
      } else if (sign === '-') {
        rows.push({ kind: 'del', text, line: numbered ? oldLine : null })
        oldLine += 1
      } else if (sign === ' ') {
        rows.push({ kind: 'ctx', text, line: numbered ? newLine : null })
        oldLine += 1
        newLine += 1
      }
    }
  })

  return rows
}

/** Сколько строк добавлено и удалено. */
export const diffStats = (rows: readonly DiffRow[]) => ({
  added: rows.filter((row) => row.kind === 'add').length,
  removed: rows.filter((row) => row.kind === 'del').length,
})

/**
 * Строки диффа правки: дифф провайдера с настоящими номерами строк, если он пришёл, иначе -
 * дифф по входу вызова (вопрос разрешения, прерванный ход). У правки по входу номеров строк
 * файла нет - известны только заменяемые куски; новый файл начинается с первой строки, его
 * номера точные и так.
 */
export const editRows = (tool: Pick<ToolFeedItem, 'action' | 'result'>): DiffRow[] => {
  const patch = tool.result?.patch
  const { action } = tool

  if (patch && patch.length > 0) return rowsFromPatch(patch, true)
  if (action.kind === 'edit') return rowsFromPatch(action.preview, false)
  if (action.kind === 'write') return rowsFromPatch(action.preview, true)

  return []
}

/** Кусок диффа для показа: с какой строки (после правки), сколько добавлено и удалено, строки. */
export type DiffHunk = { start: number | null; added: number; removed: number; rows: DiffRow[] }

/** Строки диффа - кусками по разрывам; шапка куска - номер его первой строки. */
export const hunksOfRows = (rows: readonly DiffRow[]): DiffHunk[] => {
  const hunks: DiffHunk[] = []
  let current: DiffRow[] = []

  const close = () => {
    if (current.length === 0) return

    const first = current.find((row) => row.kind !== 'del') ?? current[0]

    hunks.push({ start: first?.line ?? null, ...diffStats(current), rows: current })
    current = []
  }

  for (const row of rows) {
    if (row.kind === 'gap') close()
    else current.push(row)
  }

  close()

  return hunks
}

/**
 * Первые limit строк диффа по кускам и сколько осталось. Дифф чуть длиннее предела
 * (до slack) показывается целиком: прятать три строки ради подписи «ещё 3» - лишний клик.
 */
export const trimHunks = (
  hunks: readonly DiffHunk[],
  limit: number,
  slack: number,
): { hunks: DiffHunk[]; hidden: number } => {
  const total = hunks.reduce((sum, hunk) => sum + hunk.rows.length, 0)

  if (total <= limit + slack) return { hunks: [...hunks], hidden: 0 }

  const shown: DiffHunk[] = []
  let room = limit

  for (const hunk of hunks) {
    if (room <= 0) break

    shown.push(hunk.rows.length <= room ? hunk : { ...hunk, rows: hunk.rows.slice(0, room) })
    room -= hunk.rows.length
  }

  return { hunks: shown, hidden: total - limit }
}

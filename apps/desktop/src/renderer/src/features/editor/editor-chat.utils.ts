import type { DraftChip } from '@shared/claude-draft'
import { MAX_SELECTION_CHARS } from '@shared/claude-draft'

/**
 * Чип куска файла для чата: путь от корня проекта, строки («L12» или «L12-L18») и ровно
 * выделенный текст - не строки целиком, где стоит выделение. Длиннее потолка заметки текст
 * не едет: остаются строки, их модель прочтёт сама.
 */
export const snippetChip = (
  path: string,
  lines: { from: number; to: number },
  text: string,
): DraftChip => ({
  kind: 'ref',
  value: path,
  range: lines.from === lines.to ? `L${lines.from}` : `L${lines.from}-L${lines.to}`,
  ...(text.length <= MAX_SELECTION_CHARS ? { text } : {}),
})

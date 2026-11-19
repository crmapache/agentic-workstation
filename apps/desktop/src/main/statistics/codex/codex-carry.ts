import type { EditFact } from '../transcripts/line-facts'
import type { SpanRow } from '../transcripts/parsed-rows'
import { isRecord } from './codex-facts'

/**
 * Что разбор журнала Codex помнит между проходами (files.carry): файл дочитывается кусками,
 * а сессия, папка, модель и быстрый режим пришли строками, прочитанными раньше.
 */
export type CodexCarry = {
  /** Корневой поток - сессия статистики (у субагента - поток родителя). */
  session: string
  /** Свой поток файла: ключ строк старого журнала. */
  thread: string
  subagent: boolean
  cwd: string
  model: string
  /** Уровень обслуживания Fast (priority): цена ответа - по карточке Fast. */
  fast: boolean
  /** В файле уже был `token_usage_record`: `token_count` - его двойник. */
  records: boolean
  /** В файле уже было `item_completed`: вызовы `response_item` - его двойники. */
  items: boolean
  /** Начатый ход, ещё без сообщения человека. */
  turn: { at: number; id: string } | null
  /** Правки старого журнала, ждущие вывода apply_patch: удалась ли. */
  patches: Record<string, { at: number; edits: EditFact[] }>
  /** Открытый отрезок активности. */
  span: SpanRow | null
}

/** Поток из имени файла: `rollout-<время>-<uuid>.jsonl` (у форка - `<uuid>_<uuid>`). */
const THREAD_IN_NAME = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i

/** Поток файла по имени - пока не прочитана его первая строка. */
export const threadOfPath = (path: string): string => THREAD_IN_NAME.exec(path)?.[1] ?? path

const fresh = (thread: string): CodexCarry => ({
  session: thread,
  thread,
  subagent: false,
  cwd: '',
  model: '',
  fast: false,
  records: false,
  items: false,
  turn: null,
  patches: {},
  span: null,
})

/** carry из базы; битый или чужой - как у нового файла: разбор начнётся заново с его строк. */
export const parseCodexCarry = (text: string | null, thread: string): CodexCarry => {
  if (!text) return fresh(thread)

  try {
    const value: unknown = JSON.parse(text)

    return isRecord(value) && typeof value['session'] === 'string'
      ? { ...fresh(thread), ...(value as Partial<CodexCarry>) }
      : fresh(thread)
  } catch {
    return fresh(thread)
  }
}

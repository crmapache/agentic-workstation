import { isAbsolute } from 'node:path'

import type { FeedPatch } from '@shared/claude-feed'
import type { HistoryCause } from '@shared/local-history'

import { EDIT_TOOL_PATH_FIELD } from '../claude/changes/changes.constants'
import { AGENT_GRACE_MS, AGENT_RUNNING_MAX_MS } from './history.constants'

/** Причина, которую ждёт путь, и до какого времени она в силе. */
type Intent = { cause: HistoryCause; until: number }

/** Больше намерений не держим: просроченные выбрасываются, когда их набралось столько. */
const PRUNE_FROM = 1_000

const keyOf = (root: string, path: string) => `${root}\0${path}`

/**
 * Кто сейчас пишет файл. Событие диска не говорит, кто писал, поэтому пишущий объявляет это
 * заранее: редактор IDE - перед сохранением, переименование - перед правкой ссылок, история -
 * перед возвратом версии, агент - пока идёт его инструмент правки. Изменение файла в это
 * время получает эту причину, иначе - «извне». Последнее объявление важнее прежних.
 */
export class HistoryIntents {
  private readonly intents = new Map<string, Intent>()

  note(root: string, path: string, cause: HistoryCause, until: number): void {
    const key = keyOf(root, path)

    // Свежее объявление важнее: сохранение в редакторе посреди правки агента - правка IDE.
    this.intents.delete(key)
    this.intents.set(key, { cause, until })

    if (this.intents.size > PRUNE_FROM) this.prune(until)
  }

  causeOf(root: string, path: string, now: number): HistoryCause | null {
    const intent = this.intents.get(keyOf(root, path))

    return intent && intent.until >= now ? intent.cause : null
  }

  private prune(now: number): void {
    for (const [key, intent] of this.intents) {
      if (intent.until < now) this.intents.delete(key)
    }
  }
}

/** Правка агента из ленты разговора: вызов, абсолютный путь файла и до какого времени она в силе. */
export type AgentEdit = { id: string; path: string; until: number; running: boolean }

/**
 * Правки агента в заплатке ленты: инструменты правки (Edit, Write, ...) с абсолютным путём.
 * Идущий - в силе до потолка от начала; кончившийся - ещё немного после конца (слежение
 * копит пачку). Старые вызовы, приехавшие с подгрузкой разговора, уже не в силе: их конец
 * давно прошёл.
 */
export const agentEditsOf = (patch: FeedPatch, now: number): AgentEdit[] =>
  patch.upserts.flatMap((item): AgentEdit[] => {
    if (item.kind !== 'tool') return []

    const field = EDIT_TOOL_PATH_FIELD[item.name]
    const path = field ? item.input[field] : undefined

    if (typeof path !== 'string' || !isAbsolute(path)) return []

    if (item.status === 'running') {
      const started = item.startedAt > 0 ? item.startedAt : now

      return [{ id: item.id, path, until: started + AGENT_RUNNING_MAX_MS, running: true }]
    }

    return item.endedAt > 0
      ? [{ id: item.id, path, until: item.endedAt + AGENT_GRACE_MS, running: false }]
      : []
  })

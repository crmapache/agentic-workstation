import type {
  CalendarColor,
  CalendarSourceKind,
  CalendarSourceView,
  CalendarSourceDraft,
} from '@shared/calendar'
import { CALENDAR_COLORS, AI_WEEKS_DEFAULT, CALENDAR_AI_PROVIDERS } from '@shared/calendar'
import type { ConnectorKind } from '@shared/connectors'

import type { SourceForm, SourceFormProblem } from './SourceModal.types'

/** Коннектор, через который читает вид источника; у ICS коннектора нет. */
export const CONNECTOR_KIND: Record<CalendarSourceKind, ConnectorKind | null> = {
  google: 'calendar',
  ics: null,
  'ai-browser': 'browser',
  'ai-screen': 'computer',
}

/** Цвет нового источника: самый редкий среди уже заведённых. */
export const freeColor = (sources: readonly CalendarSourceView[]): CalendarColor =>
  [...CALENDAR_COLORS].sort(
    (a, b) =>
      sources.filter((source) => source.color === a).length -
      sources.filter((source) => source.color === b).length,
  )[0] ?? 0

/** Форма из источника или пустая для нового. */
export const formOf = (source: CalendarSourceView | null, color: CalendarColor): SourceForm => {
  const ai = source && 'ai' in source ? source.ai[0] : undefined

  return {
    kind: source?.kind ?? 'google',
    name: source?.name ?? '',
    color: source?.color ?? color,
    visible: source?.visible ?? true,
    inOverlaps: source?.inOverlaps ?? true,
    connectorId: source && 'connectorId' in source ? source.connectorId : '',
    calendarIds: source?.kind === 'google' ? source.calendarIds : [],
    url: source?.kind === 'ai-browser' ? source.url : '',
    profile: source?.kind === 'ai-browser' ? source.profile : '',
    app: source?.kind === 'ai-screen' ? source.app : '',
    hints: source && 'hints' in source ? source.hints : '',
    // Новому - с кликами: без них ИИ не откроет встречу и не возьмёт звонок и людей (ADR 0116).
    allowClicks: source?.kind === 'ai-browser' ? source.allowClicks : true,
    weeksAhead: source && 'weeksAhead' in source ? source.weeksAhead : AI_WEEKS_DEFAULT,
    provider: ai?.provider ?? 'claude',
    model: ai?.model ?? '',
    effort: ai?.effort ?? '',
  }
}

/** Чего не хватает форме; всё есть - null. editing - у ICS ссылку можно оставить прежней. */
export const problemOf = (form: SourceForm, editing: boolean): SourceFormProblem | null => {
  if (!form.name.trim()) return 'name'
  if (CONNECTOR_KIND[form.kind] && !form.connectorId) return 'connector'
  if ((form.kind === 'ics' && !editing) || form.kind === 'ai-browser') {
    if (!form.url.trim()) return 'url'
  }
  if (form.kind === 'ai-browser' && !form.profile) return 'profile'
  if (form.kind === 'ai-screen' && !form.app.trim()) return 'app'
  if (
    (form.kind === 'ai-browser' || form.kind === 'ai-screen') &&
    !CALENDAR_AI_PROVIDERS.includes(form.provider)
  ) {
    return 'provider'
  }

  return null
}

/** Черновик для главного процесса: только поля выбранного вида. */
export const draftOf = (form: SourceForm, id: string | null): CalendarSourceDraft => {
  const base = {
    id,
    name: form.name.trim(),
    color: form.color,
    visible: form.visible,
    inOverlaps: form.inOverlaps,
  }
  const ai = [{ provider: form.provider, model: form.model, effort: form.effort }]

  switch (form.kind) {
    case 'google':
      return {
        ...base,
        kind: 'google',
        connectorId: form.connectorId,
        calendarIds: form.calendarIds,
      }
    case 'ics':
      return { ...base, kind: 'ics', url: form.url.trim() }
    case 'ai-browser':
      return {
        ...base,
        kind: 'ai-browser',
        connectorId: form.connectorId,
        profile: form.profile,
        url: form.url.trim(),
        hints: form.hints.trim(),
        allowClicks: form.allowClicks,
        weeksAhead: form.weeksAhead,
        ai,
      }
    case 'ai-screen':
      return {
        ...base,
        kind: 'ai-screen',
        connectorId: form.connectorId,
        app: form.app.trim(),
        hints: form.hints.trim(),
        weeksAhead: form.weeksAhead,
        ai,
      }
  }
}

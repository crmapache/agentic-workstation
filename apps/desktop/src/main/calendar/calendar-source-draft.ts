import type { CalendarSource, CalendarSourceDraft } from '@shared/calendar'
import { icsUrl, icsMask } from '@shared/calendar-parse'

import type { Vault } from '../storage/vault'
import { icsSecretKey } from './calendar-store'

/** Поля, от которых зависит, что читается: их смена - новый снимок с нуля. */
const specKey = (source: CalendarSource | CalendarSourceDraft): string => {
  const {
    id: _id,
    name: _name,
    color: _color,
    visible: _visible,
    inOverlaps: _in,
    ...spec
  } = source

  return JSON.stringify(spec)
}

export type DraftResult =
  | { ok: true; source: CalendarSource; changed: boolean }
  | { ok: false; code: 'invalid' | 'vault-unavailable' }

/**
 * Источник из формы: у ICS полная ссылка уходит в хранилище секретов, в источник - маска хоста.
 * changed - поменялось, что читается (новый, другой календарь или адрес).
 */
export const sourceOfDraft = async (
  draft: CalendarSourceDraft,
  previous: CalendarSource | null,
  id: string,
  vault: Vault,
): Promise<DraftResult> => {
  let source: CalendarSource

  if (draft.kind === 'ics') {
    const url = draft.url ? icsUrl(draft.url) : null

    if (!url && !previous) return { ok: false, code: 'invalid' }
    if (url && !vault.available) return { ok: false, code: 'vault-unavailable' }
    if (url) await vault.set(icsSecretKey(id), url.href)

    const urlMask = url ? icsMask(url) : previous?.kind === 'ics' ? previous.urlMask : ''

    // Полная ссылка - только в хранилище: в источник (диск, окно) идёт маска хоста.
    const { url: _url, ...rest } = draft

    source = { ...rest, id, kind: 'ics', urlMask }
  } else {
    source = { ...draft, id }
  }

  return {
    ok: true,
    source,
    changed:
      !previous ||
      specKey(previous) !== specKey(source) ||
      (draft.kind === 'ics' && draft.url !== ''),
  }
}

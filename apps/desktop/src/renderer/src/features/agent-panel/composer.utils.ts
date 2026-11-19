import type { StateStorage } from 'zustand/middleware'

import type { DraftToken } from '@shared/message-draft'

import { LEGACY_STORAGE_KEY, DRAFT_SAVE_DELAY_MS, COMPOSER_STORAGE_KEY } from './composer.constants'
import type { ComposerDraft } from './draft.types'

/**
 * Черновик на диск - без байтов вставленных картинок: у такой картинки есть файл, и
 * после перезапуска она возвращается картинкой этого файла. Картинка без файла (запись
 * не успела) не сохраняется: мегабайты base64 на каждую паузу в наборе - вся цена фичи.
 */
export const savableDraft = (draft: ComposerDraft): ComposerDraft => ({
  ...draft,
  tokens: draft.tokens.flatMap((token): DraftToken[] => {
    if (token.kind !== 'chip' || !token.chip.data) return [token]

    return token.chip.path ? [{ kind: 'chip', chip: { kind: 'img', value: token.chip.path } }] : []
  }),
})

export const savableDrafts = (
  drafts: Record<string, ComposerDraft>,
): Record<string, ComposerDraft> =>
  Object.fromEntries(Object.entries(drafts).map(([key, draft]) => [key, savableDraft(draft)]))

/** Черновики прежнего формата (голый текст) - в куски, чтобы не потерялись при переходе. */
const legacyDrafts = (): string | null => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? 'null')
    const drafts = (raw as { state?: { drafts?: Record<string, unknown> } } | null)?.state?.drafts
    const converted = Object.fromEntries(
      Object.entries(drafts ?? {})
        .filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
        )
        .map(([key, text]) => [key, { tokens: [{ kind: 'text', value: text }], quotes: [] }]),
    )

    return Object.keys(converted).length > 0
      ? JSON.stringify({ state: { drafts: converted }, version: 0 })
      : null
  } catch {
    return null
  }
}

let pending: { name: string; value: string } | null = null
let timer: number | null = null

const flush = () => {
  if (timer !== null) window.clearTimeout(timer)

  timer = null

  if (pending) localStorage.setItem(pending.name, pending.value)

  pending = null
}

/**
 * Хранилище черновиков: localStorage с записью после паузы в наборе и дозаписью при
 * закрытии окна, чтобы последняя буква не потерялась.
 */
export const draftStorage: StateStorage = {
  getItem: (name) =>
    localStorage.getItem(name) ?? (name === COMPOSER_STORAGE_KEY ? legacyDrafts() : null),
  setItem: (name, value) => {
    pending = { name, value }

    if (timer === null) timer = window.setTimeout(flush, DRAFT_SAVE_DELAY_MS)
  },
  removeItem: (name) => localStorage.removeItem(name),
}

if (typeof window !== 'undefined') window.addEventListener('beforeunload', flush)

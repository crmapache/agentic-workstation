import type { DraftChip } from '@shared/claude-draft'

import { useComposerStore } from './composer.store'
import type { ComposerDraft } from './draft.types'
import { appendChip, EMPTY_DRAFT } from './draft.utils'

/** Поле вкладки на экране: черновик целиком или чип на место каретки. */
type FieldPort = {
  apply: (draft: ComposerDraft) => void
  insertChip: (chip: DraftChip) => void
}

const fields = new Map<string, FieldPort>()

/**
 * Поле вкладки принимает куски извне (вернуть сообщение, откат, вынутое из очереди,
 * цитата из ленты) как один шаг своей истории отмен: прежний черновик - в одном Cmd+Z, а
 * не потерян. Поле на экране регистрирует себя здесь; возвращает отписку.
 */
export const registerField = (key: string, port: FieldPort): (() => void) => {
  fields.set(key, port)

  return () => {
    if (fields.get(key) === port) fields.delete(key)
  }
}

/** Черновик в поле вкладки: через само поле, если оно на экране, иначе - прямо в черновик. */
export const applyDraft = (key: string, draft: ComposerDraft): void => {
  const field = fields.get(key)

  if (field) field.apply(draft)
  else useComposerStore.getState().setDraft(key, draft)
}

/**
 * Чип в поле вкладки - туда, где стояла каретка, хоть фокус и ушёл из поля (выделяли текст
 * в ленте). Поля на экране нет - в конец черновика: каретки у него и не было.
 */
export const insertFieldChip = (key: string, chip: DraftChip): void => {
  const field = fields.get(key)

  if (field) return field.insertChip(chip)

  const store = useComposerStore.getState()
  const draft = store.drafts[key] ?? EMPTY_DRAFT

  store.setDraft(key, { tokens: appendChip(draft.tokens, chip), quotes: draft.quotes })
}

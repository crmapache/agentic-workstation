import { useState } from 'react'

import type { CardForm, CardFormApi, CardModalProps } from './CardModal.types'
import { changedFields } from './CardModal.utils'

const EMPTY: CardForm = {
  title: '',
  subtitle: '',
  description: '',
  due: null,
  priority: 4,
  done: false,
  scenario: null,
}

/**
 * Форма карточки: копия полей до «Save» - доска под окном не меняется на каждый знак. Снимок
 * открытия остаётся рядом: правка уносит только поля, которые человек тронул, иначе «Save»
 * вернул бы то, что за это время поменяли очередь, ИИ или другой компьютер.
 */
export const useCardForm = (props: CardModalProps): CardFormApi => {
  const [opened] = useState<CardForm>(() =>
    props.mode === 'edit'
      ? {
          title: props.card.title,
          subtitle: props.card.subtitle,
          description: props.card.description,
          due: props.card.due,
          priority: props.card.priority,
          done: props.card.done,
          scenario: props.card.scenario,
        }
      : EMPTY,
  )
  const [form, setForm] = useState<CardForm>(opened)

  return {
    ...form,
    set: (key, value) => setForm((current) => ({ ...current, [key]: value })),
    changed: () => changedFields(opened, form),
    all: () => form,
  }
}

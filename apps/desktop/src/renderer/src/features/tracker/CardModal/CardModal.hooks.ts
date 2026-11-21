import { useState } from 'react'

import type { CardForm, CardFormApi, CardModalProps } from './CardModal.types'

const EMPTY: CardForm = {
  title: '',
  subtitle: '',
  description: '',
  due: null,
  priority: 4,
  done: false,
  scenario: null,
}

/** Форма карточки: копия полей до «Save» - доска под окном не меняется на каждый знак. */
export const useCardForm = (props: CardModalProps): CardFormApi => {
  const [form, setForm] = useState<CardForm>(() =>
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

  return {
    ...form,
    set: (key, value) => setForm((current) => ({ ...current, [key]: value })),
  }
}

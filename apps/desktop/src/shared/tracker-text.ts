import type { TrackerCardFields } from './tracker'

/**
 * Текст карточки для полей сценария (ADR 0101): подстановки раскрываются при отправке, а не при
 * привязке, - правка карточки после привязки доезжает до сценария.
 */

type CardText = Pick<TrackerCardFields, 'title' | 'subtitle' | 'description'>

/** Вся карточка одним текстом: заголовок, подзаголовок строкой ниже, описание абзацем. */
export const cardText = (card: CardText): string =>
  [card.subtitle ? `${card.title}\n${card.subtitle}` : card.title, card.description]
    .filter(Boolean)
    .join('\n\n')

/** Значение поля сценария с раскрытыми `{{card}}`, `{{title}}`, `{{subtitle}}`, `{{description}}`. */
export const expandCardText = (template: string, card: CardText): string =>
  template.replace(/\{\{\s*(card|title|subtitle|description)\s*\}\}/g, (_, name: string) =>
    name === 'card' ? cardText(card) : card[name as keyof CardText],
  )

/** Чем заполняется поле сценария, которое карточка не задала: первое - всей карточкой. */
export const defaultInputValue = (index: number): string => (index === 0 ? '{{card}}' : '')

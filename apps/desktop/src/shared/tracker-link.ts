import type { DraftChip } from './message-draft'
import type { TrackerCardFields } from './tracker'
import { cardText } from './tracker-text'

/**
 * Ссылка на карточку трекера (ADR 0113): человек кладёт её в чат любого провайдера IDE, модель
 * читает карточку инструментом tracker_card. Путь ссылки повторяет имя инструмента - модель,
 * не видевшая пояснения сервера, свяжет их сама. id карточки - UUID, один на все машины
 * (синхронизация облаком), поэтому ссылка живёт и в чате другого проекта.
 */

/** Начало ссылки на карточку; за ним - id карточки. */
export const TRACKER_CARD_LINK = 'aw://tracker/card/'

export const cardLink = (cardId: string): string => `${TRACKER_CARD_LINK}${cardId}`

/** id карточки из ссылки или из самого id: модель передаёт то, что видела в сообщении. */
export const cardIdOf = (reference: string): string => {
  const trimmed = reference.trim()

  return trimmed.startsWith(TRACKER_CARD_LINK) ? trimmed.slice(TRACKER_CARD_LINK.length) : trimmed
}

type CardSource = Pick<TrackerCardFields, 'title' | 'subtitle' | 'description'> & { id: string }

/**
 * Чип карточки для поля ввода: на чипе - заголовок, модели - ссылка и текст карточки, каким он
 * был, когда чип положили. Текст едет сразу, чтобы «Implement» начинал работу без похода за
 * карточкой; ссылка - чтобы модель могла перечитать её и отметить сделанной.
 */
export const cardChip = (card: CardSource): DraftChip => ({
  kind: 'card',
  value: card.id,
  text: cardText(card),
})

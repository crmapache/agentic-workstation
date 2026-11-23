import {
  Link,
  Send,
  Hammer,
  Pencil,
  Trash2,
  ArrowUp,
  ListPlus,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ProviderId } from '@shared/providers'
import type { TrackerCard } from '@shared/tracker'
import { isInQueue } from '@shared/tracker'
import { cardChip, cardLink } from '@shared/tracker-link'

import { useTrackerActions } from '../tracker.actions'
import { useTrackerStore } from '../tracker.store'
import type { ActionItem, ActionLeaf } from '../ActionsMenu/ActionsMenu.types'
import { useBoard } from '../Board/Board.context'
import { copyTokens } from '../../../lib/draft-clipboard'
import { PROVIDER_ICONS, PROVIDER_LABEL_KEYS } from '../../../lib/provider-panels.constants'
import { useActionNoticeStore } from '../../../state/action-notice.store'
import { useBarArrangement } from '../../../state/bar-buttons.store'
import { shownIds } from '../../../state/bar-buttons.utils'
import { useChatHandoffStore } from '../../../state/chat-handoff.store'
import {
  PANEL_PROVIDERS,
  PROVIDER_VIEW_OF,
  PROVIDER_VIEW_IDS,
} from '../../../state/layout.constants'
import { useLayoutStore } from '../../../state/layout.store'
import { useProviders } from '../../../state/providers.queries'
import { useActiveProject } from '../../../state/workspace.queries'
import type { CardMenuArgs } from './CardTile.types'

/**
 * Карточка в чат ИИ (ADR 0113). «Implement» - чипом в новый чат выбранного провайдера: панель
 * показывается, карточка начинает свой разговор (пустая вкладка - она и есть), отправляет
 * человек. Провайдеры - те, чьи кнопки стоят на правой полосе, в её порядке: спрятанную кнопку
 * человек убрал как ненужную. «Copy link» - ссылкой в буфер, и живым чипом для поля любого чата
 * IDE.
 */
const useCardChat = (card: TrackerCard) => {
  const { t } = useTranslation()
  const project = useActiveProject()
  const { data: providers = [] } = useProviders()
  const arrangement = useBarArrangement('provider')
  const showProviderView = useLayoutStore((state) => state.showProviderView)
  const notify = useActionNoticeStore((state) => state.show)
  const shown = shownIds(PROVIDER_VIEW_IDS, arrangement, 'top')
  const order = (id: ProviderId) => shown.indexOf(PROVIDER_VIEW_OF[id])

  const implement = (provider: ProviderId) => {
    if (!project) return

    useChatHandoffStore
      .getState()
      .hand({ projectId: project.id, provider, chip: cardChip(card), fresh: true })
    showProviderView(PROVIDER_VIEW_OF[provider])
  }
  const copyLink = () => {
    const chip = cardChip(card)

    copyTokens([{ kind: 'chip', chip }], cardLink(card.id)).then(
      () => notify({ tone: 'success', title: t('tracker.card.linkCopied') }),
      () => notify({ tone: 'danger', title: t('tracker.card.linkNotCopied') }),
    )
  }
  const targets: ActionLeaf[] = PANEL_PROVIDERS.filter((id) => order(id) >= 0)
    .sort((a, b) => order(a) - order(b))
    .map((id) => {
      // Список ещё не пришёл - пункт доступен: отказ, если он будет, скажет сама панель.
      const missing = providers.find((one) => one.id === id)?.available === false

      return {
        key: id,
        icon: PROVIDER_ICONS[id],
        label: t(PROVIDER_LABEL_KEYS[id]),
        description: missing ? t('common.notInstalled') : undefined,
        disabled: missing,
        onSelect: () => implement(id),
      }
    })

  return { targets, copyLink }
}

/**
 * Меню «⋯» карточки: открыть, сделать руками ИИ, продолжение, очередь, ссылка, сдвиг на шаг и
 * удаление. Сдвиг идёт по оси, на которой карточка стоит: задача - вверх и вниз, продолжение -
 * влево и вправо.
 */
export const useCardMenu = ({ card, groupId, followUp, rootId }: CardMenuArgs): ActionItem[] => {
  const { t } = useTranslation()
  const { moveBy } = useBoard()
  const { apply } = useTrackerActions()
  const edit = useTrackerStore((state) => state.edit)
  const openSend = useTrackerStore((state) => state.openSend)
  const { targets, copyLink } = useCardChat(card)
  const source = { kind: 'card' as const, id: card.id }

  return [
    {
      key: 'edit',
      icon: Pencil,
      label: t('tracker.card.edit'),
      onSelect: () => edit({ kind: 'card', cardId: card.id }),
    },
    {
      key: 'implement',
      icon: Hammer,
      label: t('tracker.card.implement'),
      menuLabel: t('tracker.card.implementWith'),
      items: targets,
    },
    {
      key: 'follow',
      icon: ListPlus,
      label: t('tracker.card.addFollowUp'),
      onSelect: () => edit({ kind: 'newCard', groupId, followUpOf: rootId }),
    },
    {
      key: 'send',
      icon: Send,
      label: t('tracker.card.send'),
      // Карточка, которая уже стоит в очереди, второй раз не уходит - главный процесс откажет.
      disabled: !card.scenario || isInQueue(card.run),
      onSelect: () => openSend({ kind: 'card', cardId: card.id }),
    },
    { key: 'link', icon: Link, label: t('tracker.card.copyLink'), onSelect: copyLink },
    {
      key: 'back',
      icon: followUp ? ArrowLeft : ArrowUp,
      label: followUp ? t('tracker.card.moveLeft') : t('tracker.card.moveUp'),
      onSelect: () => moveBy(source, -1),
    },
    {
      key: 'forward',
      icon: followUp ? ArrowRight : ArrowDown,
      label: followUp ? t('tracker.card.moveRight') : t('tracker.card.moveDown'),
      onSelect: () => moveBy(source, 1),
    },
    {
      key: 'delete',
      icon: Trash2,
      label: t('tracker.card.delete'),
      danger: true,
      onSelect: () => void apply({ kind: 'card.delete', id: card.id }),
    },
  ]
}

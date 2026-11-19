import { useRef, useState, useLayoutEffect } from 'react'
import type { MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Quote, GitFork } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { useComposerStore } from '../composer.store'
import { useConversationActions } from '../conversation-actions.hooks'
import { quotesOf, EMPTY_DRAFT } from '../draft.utils'
import { usePanelCapabilities } from '../panel.queries'
import { usePanelStore } from '../panel.store'
import { MENU_GAP_PX } from './SelectionMenu.constants'
import { useFeedSelection } from './SelectionMenu.hooks'
import styles from './SelectionMenu.module.scss'
import type { SelectionMenuProps } from './SelectionMenu.types'
import { menuPlace, forkPointAfter } from './SelectionMenu.utils'

/** Нажатие до потери выделения: на mousedown, и выделение не снимается. */
const keepSelection = (event: MouseEvent) => event.preventDefault()

/**
 * Меню у выделенного в ленте (как в ACC): Quote кладёт выделенное чипом цитаты в поле,
 * Fork (если провайдер умеет форк) - новая вкладка с разговором до конца хода, где
 * выделили, и цитатой над полем.
 * Копировать умеет и так Cmd+C - отдельной кнопки нет.
 */
export const SelectionMenu = ({ areaRef, conversation, items }: SelectionMenuProps) => {
  const { t } = useTranslation()
  const { fork } = useConversationActions()
  // Форк с выделенного места - только у провайдера, который режет разговор по сообщению.
  const { fork: offersFork, forkAtMessage } = usePanelCapabilities()
  const canFork = offersFork && forkAtMessage
  const insertChip = usePanelStore((store) => store.insertChip)
  const { selection, clear } = useFeedSelection(areaRef)
  const menuRef = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const menu = menuRef.current

    if (!menu || !selection) return

    const { width, height } = menu.getBoundingClientRect()

    setPlace(
      menuPlace(selection.rect, { width, height }, { width: window.innerWidth }, MENU_GAP_PX),
    )
  }, [selection])

  if (!selection) return null

  const handleQuote = () => {
    const draft = useComposerStore.getState().drafts[conversation.id] ?? EMPTY_DRAFT
    const number =
      draft.tokens.filter((token) => token.kind === 'chip' && token.chip.kind === 'quote').length +
      1

    // Сначала снять выделение в ленте: вставка ставит каретку в поле, и снятое после
    // выделение увело бы её в конец.
    window.getSelection()?.removeAllRanges()
    insertChip(conversation.id, { kind: 'quote', value: `ref${number}`, text: selection.text })
    clear()
  }

  const handleFork = () => {
    void fork(conversation.id, forkPointAfter(items, selection.rowId), {
      tokens: [],
      quotes: quotesOf([selection.text]),
    })
    window.getSelection()?.removeAllRanges()
    clear()
  }

  return createPortal(
    <div
      ref={menuRef}
      role="toolbar"
      aria-label={t('agentPanel.selection.label')}
      className={styles.selectionMenu}
      data-placed={place ? '' : undefined}
      // eslint-disable-next-line no-restricted-syntax -- место выделения меряется в рантайме
      style={place ?? undefined}>
      <Button
        size="sm"
        variant="ghost"
        icon={Quote}
        onMouseDown={keepSelection}
        onClick={handleQuote}>
        {t('agentPanel.selection.quote')}
      </Button>
      {canFork && (
        <Button
          size="sm"
          variant="ghost"
          icon={GitFork}
          onMouseDown={keepSelection}
          onClick={handleFork}>
          {t('agentPanel.selection.fork')}
        </Button>
      )}
    </div>,
    document.body,
  )
}

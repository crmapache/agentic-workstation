import { useTranslation } from 'react-i18next'

import { isInboxAsking } from '@shared/inbox'

import { Button } from '@agentic-workstation/ui/Button'
import { Toast } from '@agentic-workstation/ui/Toast'

import type { InboxToastProps } from '../InboxToasts.types'
import { useInboxActions } from '../../inbox.actions'
import { previewOf, toastCloseMs, toastTitleOf, answersAtOnce } from '../../inbox.utils'
import { buttonsOf } from '../../InboxCard/InboxCard.utils'
import { ItemButtons } from '../../InboxCard/parts/ItemButtons'
import { useInboxUiStore } from '../../../../state/inbox-ui.store'
import { useLayoutStore } from '../../../../state/layout.store'
import { QuickOptions } from './QuickOptions'

/**
 * Одно уведомление в углу окна: заголовок, суть строкой и кнопки, на которые можно ответить
 * сразу; у вопроса с одним ответом - его варианты. Несколько вопросов, своё слово и замечание к
 * плану - на виде уведомлений («Open notifications»). Крестик только убирает его из угла, а
 * «Got it» - прочитано и закрыто совсем: оно уходит в Done и не держит число на иконке. У того,
 * что ждёт ответа, «Got it» нет: закрыть вопрос значит отказать прогону.
 */
export const InboxToast = ({ item }: InboxToastProps) => {
  const { t } = useTranslation()
  const dropToast = useInboxUiStore((state) => state.dropToast)
  const reveal = useInboxUiStore((state) => state.reveal)
  const inbox = useInboxActions()

  const quick = item.kind === 'question' && answersAtOnce(item.questions)
  // Вопрос отвечают вариантами выше; «доработать план» просит замечания - это на виде.
  const buttons =
    item.kind === 'question'
      ? []
      : buttonsOf(item)
          .filter((action) => action.kind !== 'revise')
          .slice(0, 3)
  // Своя кнопка «закрыть» от ИИ делает то же самое - второй рядом не нужно.
  const canAcknowledge =
    !isInboxAsking(item) && !buttons.some((action) => action.kind === 'dismiss')

  const handleAcknowledge = () => void inbox.dismiss([item.id])

  const handleOpen = () => {
    reveal(item.id)
    useLayoutStore.getState().showMainView('inbox')
  }

  return (
    <Toast
      tone={item.kind === 'failure' ? 'danger' : 'neutral'}
      title={toastTitleOf(item)}
      description={previewOf(item) || undefined}
      close={{
        label: t('common.close'),
        onClose: () => dropToast(item.id),
        autoCloseMs: toastCloseMs(item),
      }}
      actions={
        <>
          {quick && <QuickOptions item={item} />}
          <ItemButtons item={item} text="" actions={buttons} />
          {canAcknowledge && (
            <Button size="sm" variant="secondary" onClick={handleAcknowledge}>
              {t('inbox.toast.gotIt')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={handleOpen}>
            {t('inbox.toast.more')}
          </Button>
        </>
      }
    />
  )
}

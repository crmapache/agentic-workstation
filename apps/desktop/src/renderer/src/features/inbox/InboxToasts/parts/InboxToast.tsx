import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Toast } from '@agentic-workstation/ui/Toast'

import { useToastTimer } from '../InboxToasts.hooks'
import type { InboxToastProps } from '../InboxToasts.types'
import { previewOf, toastTitleOf, answersAtOnce } from '../../inbox.utils'
import { buttonsOf } from '../../InboxCard/InboxCard.utils'
import { ItemButtons } from '../../InboxCard/parts/ItemButtons'
import { useInboxUiStore } from '../../../../state/inbox-ui.store'
import { useLayoutStore } from '../../../../state/layout.store'
import { QuickOptions } from './QuickOptions'

/**
 * Одно уведомление в углу окна: заголовок, суть строкой и кнопки, на которые можно ответить
 * сразу; у вопроса с одним ответом - его варианты. Несколько вопросов, своё слово и замечание к
 * плану - на виде уведомлений («Open notifications»).
 */
export const InboxToast = ({ item }: InboxToastProps) => {
  const { t } = useTranslation()
  const dropToast = useInboxUiStore((state) => state.dropToast)
  const reveal = useInboxUiStore((state) => state.reveal)

  useToastTimer(item)

  const quick = item.kind === 'question' && answersAtOnce(item.questions)
  // Вопрос отвечают вариантами выше; «доработать план» просит замечания - это на виде.
  const buttons =
    item.kind === 'question'
      ? []
      : buttonsOf(item)
          .filter((action) => action.kind !== 'revise')
          .slice(0, 3)

  const handleOpen = () => {
    reveal(item.id)
    useLayoutStore.getState().showMainView('inbox')
  }

  return (
    <Toast
      tone={item.kind === 'failure' ? 'danger' : 'neutral'}
      title={toastTitleOf(item)}
      description={previewOf(item) || undefined}
      actions={
        <>
          {quick && <QuickOptions item={item} />}
          <ItemButtons item={item} text="" actions={buttons} />
          <Button size="sm" variant="ghost" onClick={handleOpen}>
            {t('inbox.toast.more')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => dropToast(item.id)}>
            {t('common.close')}
          </Button>
        </>
      }
    />
  )
}

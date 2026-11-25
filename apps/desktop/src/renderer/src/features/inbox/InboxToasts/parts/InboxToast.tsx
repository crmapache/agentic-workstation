import { useTranslation } from 'react-i18next'

import { isInboxAsking } from '@shared/inbox'

import { Button } from '@agentic-workstation/ui/Button'
import { Toast } from '@agentic-workstation/ui/Toast'

import styles from '../InboxToasts.module.scss'
import type { InboxToastProps } from '../InboxToasts.types'
import { useInboxActions } from '../../inbox.actions'
import { previewOf, toastCloseMs, answersAtOnce } from '../../inbox.utils'
import { buttonsOf } from '../../InboxCard/InboxCard.utils'
import { ItemButton } from '../../InboxCard/parts/ItemButton'
import { useInboxUiStore } from '../../../../state/inbox-ui.store'
import { useLayoutStore } from '../../../../state/layout.store'
import { QuickOptions } from './QuickOptions'

/**
 * Одно уведомление в углу окна: от кого, заголовок, суть и кнопки, на которые можно ответить
 * сразу; у вопроса с одним ответом - его варианты. Несколько вопросов, своё слово и замечание к
 * плану - на виде уведомлений: туда ведёт значок у крестика, а если ответить здесь нечем - кнопка
 * в ряду. Крестик только убирает уведомление из угла, а «Got it» - прочитано и закрыто совсем:
 * оно уходит в Done и не держит число на иконке. У того, что ждёт ответа, «Got it» нет: закрыть
 * вопрос значит отказать прогону.
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
  // Ответ только на виде уведомлений: путь туда - главное в ряду, а не значок в углу.
  const answersElsewhere = !quick && buttons.length === 0 && !canAcknowledge
  const eyebrow = item.source && item.source !== item.title ? item.source : undefined

  const handleAcknowledge = () => void inbox.dismiss([item.id])

  const handleOpen = () => {
    reveal(item.id)
    useLayoutStore.getState().showMainView('inbox')
  }

  return (
    <Toast
      tone={item.kind === 'failure' ? 'danger' : 'neutral'}
      eyebrow={eyebrow}
      title={item.title}
      description={previewOf(item) || undefined}
      expand={answersElsewhere ? undefined : { label: t('inbox.toast.more'), onExpand: handleOpen }}
      close={{
        label: t('common.close'),
        onClose: () => dropToast(item.id),
        autoCloseMs: toastCloseMs(item),
      }}
      actions={
        <>
          {quick && <QuickOptions item={item} />}
          {buttons.map((action) => (
            <ItemButton key={action.id} item={item} action={action} text="" />
          ))}
          {canAcknowledge && (
            <span className={styles.acknowledge}>
              <Button size="sm" variant="ghost" onClick={handleAcknowledge}>
                {t('inbox.toast.gotIt')}
              </Button>
            </span>
          )}
          {answersElsewhere && (
            <Button size="sm" variant="secondary" onClick={handleOpen}>
              {t('inbox.toast.more')}
            </Button>
          )}
        </>
      }
    />
  )
}

import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../NoticeRow.module.scss'
import type { NoticeItemProps } from '../NoticeRow.types'
import { useFeedStore } from '../../feed.store'
import { LinkedText } from '../../LinkedText/LinkedText'
import { SignInActions } from './SignInActions'

/**
 * Ошибка, как в ACC: красная плашка с текстом CLI (адреса и пути в нём - ссылки) и
 * крестиком. Протухший вход - кнопки войти и сменить аккаунт, отказ шлюза из-за параметра
 * выборки - объяснение (как в ACC): параметр послала не панель, а шлюз или прокси из
 * настроек. Но только у живой записи: у прочитанной из истории входить и чинить уже нечего.
 */
export const ErrorRow = ({ item }: NoticeItemProps) => {
  const { t } = useTranslation()
  const isDismissed = useFeedStore((store) => store.dismissed.has(item.id))
  const dismiss = useFeedStore((store) => store.dismiss)
  // Форк не удалось разрезать на выбранном сообщении - он несёт весь разговор (ACC).
  const text = item.code === 'fork-whole' ? t('claudeCode.rewind.forkWhole') : item.detail
  const title =
    item.code === 'start-failed'
      ? t('claudeCode.notice.startFailed')
      : item.code === 'not-logged-in'
        ? t('claudeCode.notice.notLoggedIn')
        : ''

  const handleDismiss = () => dismiss(item.id)

  if (isDismissed) return null

  return (
    <div role="alert" className={styles.error}>
      <div className={styles.errorBody}>
        {title && <span className={styles.errorTitle}>{title}</span>}
        {text && (
          <span className={styles.errorText}>
            <LinkedText text={text} pathTone="inherit" />
          </span>
        )}
        {item.code === 'not-logged-in' && !item.replayed && <SignInActions />}
        {item.sampling && !item.replayed && (
          <span className={styles.errorNote}>{t('claudeCode.notice.sampling')}</span>
        )}
      </div>
      <IconButton
        icon={X}
        size="sm"
        label={t('claudeCode.notice.dismiss')}
        onClick={handleDismiss}
      />
    </div>
  )
}

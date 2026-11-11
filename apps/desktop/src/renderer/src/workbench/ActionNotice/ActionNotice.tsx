import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Toast } from '@agentic-workstation/ui/Toast'

import { useActionNoticeStore } from '../../state/action-notice.store'
import { SUCCESS_NOTICE_MS } from './ActionNotice.constants'

/**
 * Итог действия человека в углу окна: git с тем, что ответил сам git, дерево файлов -
 * переименовано, скопировано, в корзине, или почему не вышло. Успех уходит сам, неудача
 * остаётся, пока её не закроют.
 */
export const ActionNotice = () => {
  const { t } = useTranslation()
  const notice = useActionNoticeStore((state) => state.notice)
  const dismiss = useActionNoticeStore((state) => state.dismiss)

  useEffect(() => {
    if (notice?.tone !== 'success') return

    const timer = setTimeout(dismiss, SUCCESS_NOTICE_MS)

    return () => clearTimeout(timer)
  }, [notice, dismiss])

  if (!notice) return null

  return (
    <Toast
      tone={notice.tone === 'danger' ? 'danger' : 'neutral'}
      title={notice.title}
      description={notice.details}
      actions={
        <Button variant="ghost" size="sm" onClick={dismiss}>
          {t('common.close')}
        </Button>
      }
    />
  )
}

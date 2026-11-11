import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Toast } from '@agentic-workstation/ui/Toast'

import { useGitNoticeStore } from '../git-notice.store'
import { SUCCESS_NOTICE_MS } from './GitNotice.constants'

/**
 * Итог действия git в углу окна - с тем, что ответил сам git. Успех уходит сам,
 * неудача остаётся, пока её не закроют.
 */
export const GitNotice = () => {
  const { t } = useTranslation()
  const notice = useGitNoticeStore((state) => state.notice)
  const dismiss = useGitNoticeStore((state) => state.dismiss)

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

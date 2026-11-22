import { useTranslation } from 'react-i18next'

import { Toast } from '@agentic-workstation/ui/Toast'

import { objectKey } from '../../lib/object-key'
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

  if (!notice) return null

  return (
    <Toast
      key={objectKey(notice)}
      tone={notice.tone === 'danger' ? 'danger' : 'neutral'}
      title={notice.title}
      description={notice.details}
      close={{
        label: t('common.close'),
        onClose: dismiss,
        autoCloseMs: notice.tone === 'success' ? SUCCESS_NOTICE_MS : undefined,
      }}
    />
  )
}

import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Toast } from '@agentic-workstation/ui/Toast'

import { useToastStore } from '../../state/toast.store'
import styles from './Toasts.module.scss'

/**
 * Уведомления об отказах команд - сразу над низом экрана (их ставит Screen), сами уходят через
 * несколько секунд.
 */
export const Toasts = () => {
  const { t } = useTranslation()
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className={styles.toasts} role="status">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          tone="danger"
          title={toast.title}
          description={toast.description}
          actions={
            <Button size="touch" variant="ghost" onClick={() => dismiss(toast.id)}>
              {t('common.dismiss')}
            </Button>
          }
        />
      ))}
    </div>
  )
}

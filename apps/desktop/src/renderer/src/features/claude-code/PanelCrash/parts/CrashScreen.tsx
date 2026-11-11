import { RotateCw, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import styles from '../PanelCrash.module.scss'
import type { CrashScreenProps } from '../PanelCrash.types'

/** Экран упавшей панели: что случилось, текст ошибки мелко и «Reload the panel». */
export const CrashScreen = ({ message, onReload }: CrashScreenProps) => {
  const { t } = useTranslation()

  return (
    <EmptyState
      icon={TriangleAlert}
      title={t('claudeCode.crash.title')}
      description={t('claudeCode.crash.text')}
      action={
        <div className={styles.action}>
          <p className={styles.message}>{message}</p>
          <Button variant="primary" icon={RotateCw} onClick={onReload}>
            {t('claudeCode.crash.button')}
          </Button>
        </div>
      }
    />
  )
}

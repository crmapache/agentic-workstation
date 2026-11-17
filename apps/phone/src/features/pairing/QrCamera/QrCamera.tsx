import { CameraOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { useQrCamera } from './QrCamera.hooks'
import styles from './QrCamera.module.scss'
import type { QrCameraProps } from './QrCamera.types'

/**
 * Видоискатель камеры телефона во всё тело экрана: сам читает QR и отдаёт его текст. Камеры нет
 * (не разрешили, занята, её нет) - вместо видоискателя что случилось и «Try again».
 */
export const QrCamera = ({ onText, notice }: QrCameraProps) => {
  const { t } = useTranslation()
  const { videoRef, state, retry } = useQrCamera(onText)

  if (state.kind === 'problem') {
    const { problem } = state

    return (
      <EmptyState
        icon={CameraOff}
        title={t(`pairing.camera.${problem}.title`)}
        description={t(`pairing.camera.${problem}.description`)}
        action={
          problem === 'unsupported' ? undefined : (
            <Button size="touch" variant="secondary" onClick={retry}>
              {t('pairing.camera.retry')}
            </Button>
          )
        }
      />
    )
  }

  return (
    <div className={styles.camera}>
      <div className={styles.viewfinder}>
        <video
          ref={videoRef}
          className={styles.video}
          aria-label={t('pairing.camera.label')}
          muted
          playsInline
        />
        <span className={styles.aim} aria-hidden />
        {state.kind === 'starting' && (
          <div className={styles.starting}>
            <Spinner size="md" label={t('pairing.camera.starting')} />
          </div>
        )}
      </div>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
    </div>
  )
}

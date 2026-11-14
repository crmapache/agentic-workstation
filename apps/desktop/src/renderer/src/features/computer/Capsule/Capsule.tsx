import { Play, Pause, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { RollingLine } from '@agentic-workstation/ui/RollingLine'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { useCapsule } from '../computer.queries'
import { useCapsuleLine } from './Capsule.hooks'
import styles from './Capsule.module.scss'

/**
 * Капсула Computer Use внизу экрана (ADR 0057), как у диктовки: ИИ держит компьютер - знак
 * состояния (действует - крутится, думает - тёплая точка, пауза - серая), строкой - что он
 * делает или говорит, со сменой снизу вверх, и две кнопки-значка человека: пауза или
 * продолжение и остановка. Подсказка у значков в окне ростом с капсулу не всплывёт - знаки
 * общепринятые, имя - для скринридера.
 */
export const Capsule = () => {
  const { t } = useTranslation()
  const { view, control } = useCapsule()
  const line = useCapsuleLine(view)

  if (!view) return null

  const isPaused = view.state === 'paused'

  const handlePause = () => void control(isPaused ? 'resume' : 'pause')

  const handleStop = () => void control('stop')

  return (
    <div className={styles.capsule} role="status" aria-label={t('computer.capsule.label')}>
      <span className={styles.mark} aria-hidden>
        {view.state === 'working' ? (
          <Spinner tone="warning" />
        ) : (
          <span className={isPaused ? styles.dotPaused : styles.dot} />
        )}
      </span>
      <span className={styles.line}>
        <RollingLine text={line} />
      </span>
      <IconButton
        icon={isPaused ? Play : Pause}
        label={isPaused ? t('computer.capsule.resume') : t('computer.capsule.pause')}
        onClick={handlePause}
      />
      <IconButton
        icon={Square}
        variant="danger"
        label={t('computer.capsule.stop')}
        onClick={handleStop}
      />
    </div>
  )
}

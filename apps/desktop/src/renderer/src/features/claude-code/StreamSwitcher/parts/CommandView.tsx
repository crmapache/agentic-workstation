import { Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../StreamSwitcher.module.scss'
import type { CommandViewProps } from '../StreamSwitcher.types'
import { commandSteps } from '../StreamSwitcher.utils'
import { CodeBlock } from '../../CodeBlock/CodeBlock'
import { StatusDot } from '../../StatusDot/StatusDot'
import { ChipClock } from './ChipClock'

/**
 * Что за фоновая команда - панелью по нажатию на её чип: сколько идёт, зачем (описание
 * модели) и сама команда с подсветкой, цепочка - строкой на шаг, длинная строка
 * переносится. Копия - кнопкой в углу кода; остановка - тем же вопросом, что крестик чипа.
 */
export const CommandView = ({ command, description, startedAt, onStop }: CommandViewProps) => {
  const { t } = useTranslation()

  return (
    <div className={styles.commandView}>
      <div className={styles.commandHead}>
        <StatusDot status="running" />
        <span className={styles.commandTitle}>{t('claudeCode.agents.streams.commandTitle')}</span>
        <ChipClock startedAt={startedAt} />
      </div>
      {description && <div className={styles.commandDescription}>{description}</div>}
      <CodeBlock code={commandSteps(command)} language="bash" compact wrap />
      {onStop && (
        <div className={styles.commandActions}>
          <Button size="sm" variant="ghost" icon={Square} onClick={onStop}>
            {t('claudeCode.agents.streams.stopCommand')}
          </Button>
        </div>
      )}
    </div>
  )
}

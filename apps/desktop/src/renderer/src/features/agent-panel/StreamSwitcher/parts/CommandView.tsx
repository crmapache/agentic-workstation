import { Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { SHELL_KEYS } from '../StreamSwitcher.constants'
import styles from '../StreamSwitcher.module.scss'
import type { CommandViewProps } from '../StreamSwitcher.types'
import { commandSteps } from '../StreamSwitcher.utils'
import { CodeBlock } from '../../CodeBlock/CodeBlock'
import { StatusDot } from '../../StatusDot/StatusDot'
import { ChipClock } from './ChipClock'

/**
 * Что за фоновая команда или наблюдатель - панелью по нажатию на чип: сколько идёт, зачем
 * (описание модели) и сама команда с подсветкой, цепочка - строкой на шаг, длинная строка
 * переносится; у наблюдателя сокета - его адрес. Копия - кнопкой в углу кода; остановка - тем
 * же вопросом, что крестик чипа.
 */
export const CommandView = ({ shell, startedAt, onStop }: CommandViewProps) => {
  const { t } = useTranslation()
  const keys = SHELL_KEYS[shell.kind]

  return (
    <div className={styles.commandView}>
      <div className={styles.commandHead}>
        <StatusDot status="running" />
        <span className={styles.commandTitle}>{t(keys.title)}</span>
        <ChipClock startedAt={startedAt} />
      </div>
      {shell.description && <div className={styles.commandDescription}>{shell.description}</div>}
      {shell.command ? (
        <CodeBlock code={commandSteps(shell.command)} language="bash" compact wrap />
      ) : (
        shell.url && <CodeBlock code={shell.url} compact wrap />
      )}
      {onStop && (
        <div className={styles.commandActions}>
          <Button size="sm" variant="ghost" icon={Square} onClick={onStop}>
            {t(keys.stop)}
          </Button>
        </div>
      )}
    </div>
  )
}

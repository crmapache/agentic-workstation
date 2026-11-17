import { useState } from 'react'

import { AgentPointer } from '@agentic-workstation/ui/AgentPointer'

import { useIpcEvent } from '../../../lib/ipc.hooks'
import styles from './ComputerPointer.module.scss'

/**
 * Стрелка ИИ Computer Use (ADR 0079) на всё окно стрелки: острие - в середине окна, окно за рукой
 * ведёт главный процесс. Сюда приходят только нажатия руки - круг от острия.
 */
export const ComputerPointer = () => {
  const [press, setPress] = useState(0)

  useIpcEvent('computer:pointerPressed', setPress)

  return (
    <div className={styles.stage}>
      <AgentPointer tone="computer" press={press} />
    </div>
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AgentPointer } from '@agentic-workstation/ui/AgentPointer'
import { Button } from '@agentic-workstation/ui/Button'

import styles from '../ComponentsView.module.scss'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Стрелка ИИ (AgentPointer): Browser в странице Chrome - акцентом, Computer Use поверх экрана -
 * стальным синим. Кнопка - нажатие: круг от острия у обеих.
 */
export const AgentPointerSpecimen = () => {
  const { t } = useTranslation('showcase')
  const [press, setPress] = useState(0)

  const handlePress = () => setPress((value) => value + 1)

  return (
    <Specimen label={t('specimens.agentPointer')}>
      <span className={styles.pointerSample}>
        <AgentPointer tone="browser" press={press} />
      </span>
      <span className={styles.pointerSample}>
        <AgentPointer tone="computer" press={press} />
      </span>
      <Button size="sm" variant="ghost" onClick={handlePress}>
        {t('samples.pointerPress')}
      </Button>
    </Specimen>
  )
}

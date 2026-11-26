import { clsx } from 'clsx'
import { Sparkles, CheckCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../ComponentsView.module.scss'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Кнопки tinted внутри цветных плашек (как накладка в карточке встречи): красной, жёлтой и
 * спокойной, рядом с тихой ghost; последняя - с открытым меню.
 */
export const TintedButtonsSpecimen = () => {
  const { t } = useTranslation('showcase')

  return (
    <Specimen label={t('specimens.buttonsTinted')}>
      {[styles.plaqueDanger, styles.plaqueWarning, styles.plaqueCalm].map((tone, index) => (
        <div key={tone} className={clsx(styles.tonePlaque, tone)}>
          <Button variant="ghost" size="sm" icon={CheckCheck}>
            {t('samples.markSeen')}
          </Button>
          <Button variant="tinted" size="sm" icon={Sparkles} menu aria-expanded={index === 2}>
            {t('samples.askAi')}
          </Button>
        </div>
      ))}
    </Specimen>
  )
}

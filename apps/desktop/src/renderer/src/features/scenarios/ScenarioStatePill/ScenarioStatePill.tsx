import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'

import { STATE_TONES } from './ScenarioStatePill.constants'
import type { ScenarioStatePillProps } from './ScenarioStatePill.types'

/**
 * Плашка состояния прогона или шага (StatePill в ACC): точка тона и слово. Показание, а не
 * действие: на карточке прогона стоит концом строки показаний. Прогон на лимите - своё слово и
 * жёлтый, как у полосы лимита: он ждёт часа, а не человека (оранжевый - «ждёт тебя»).
 */
export const ScenarioStatePill = (props: ScenarioStatePillProps) => {
  const { t } = useTranslation()
  const label = props.limited
    ? t('scenarios.common.states.limit')
    : props.of === 'run'
      ? t(`scenarios.common.states.${props.state}`)
      : t(`scenarios.common.stepStates.${props.state}`)

  return (
    <Badge tone={props.limited ? 'warning' : (STATE_TONES[props.state] ?? 'neutral')}>
      {label}
    </Badge>
  )
}

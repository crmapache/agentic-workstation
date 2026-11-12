import { useTranslation } from 'react-i18next'

import type { LaunchFailureLineProps } from '../LaunchModal.types'
import { ScenarioAlert } from '../../ScenarioAlert/ScenarioAlert'

/**
 * Почему не запустилось - словами кода, а подробность (что сказал git) - следом: по ней
 * понятно, что поправить. Окно остаётся открытым с тем, что набрано.
 */
export const LaunchFailureLine = ({ failure }: LaunchFailureLineProps) => {
  const { t } = useTranslation()
  const words = t(`scenarios.codes.${failure.code}`, {
    defaultValue: t('scenarios.codes.unknown'),
  })

  return (
    <ScenarioAlert tone="danger" alert>
      {failure.detail ? `${words} ${failure.detail}` : words}
    </ScenarioAlert>
  )
}

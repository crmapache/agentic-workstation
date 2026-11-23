import { useTranslation } from 'react-i18next'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { WORD_LIST } from '../QueueCard.constants'
import styles from '../QueueCard.module.scss'
import type { QueueItemRunsOnProps } from '../QueueCard.types'
import { modelName, runsOnChips } from '../QueueCard.utils'
import { useProviders } from '../../../../state/providers.queries'

/**
 * На чём идёт сценарий строки: модель и усилие чипом, у сценария с разными моделями - чип на
 * модель с её уровнями («Opus · Medium, High», «Sonnet · Low»). Имя модели - как в меню MODEL
 * редактора; пусто - модель по умолчанию.
 */
export const QueueItemRunsOn = ({ provider, runsOn }: QueueItemRunsOnProps) => {
  const { t } = useTranslation()
  const models = useProviders().data?.find((one) => one.id === provider)?.models ?? []

  return runsOnChips(runsOn).map(({ model, efforts }) => {
    const name = model ? modelName(model, models) : t('scenarios.queues.items.runsOn.defaultModel')
    const levels = WORD_LIST.format(
      efforts.map((level) =>
        t(`scenarios.editor.runsOn.efforts.${level}`, { defaultValue: level }),
      ),
    )
    const label = levels ? `${name} · ${levels}` : name

    return (
      <Tooltip key={model} label={t('scenarios.queues.items.runsOn.hint', { value: label })}>
        <span className={styles.runsOn}>{label}</span>
      </Tooltip>
    )
  })
}

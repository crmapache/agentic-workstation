import { useTranslation } from 'react-i18next'

import { useEditorProvider } from '../editor-provider.context'
import styles from '../EditorModal.module.scss'
import type { HeadPaneProps } from '../EditorModal.types'
import { retryOptions } from '../EditorModal.utils'
import { providerChoices } from '../../../../lib/provider-choices'
import { useProviders } from '../../../../state/providers.queries'
import { ChoicePicker } from './ChoicePicker'
import { LongField } from './LongField'
import { RunsOn } from './RunsOn'

/**
 * Главный поток прогона: брифинг, по которому голова судит каждую карточку, для какого
 * провайдера сценарий и на чём идёт голова, как она поступает с вопросом карточки, с
 * карточкой, которую не доделали, и сколько раз возвращает на доработку.
 */
export const HeadPane = ({ head, onHead, onProvider }: HeadPaneProps) => {
  const { t } = useTranslation()
  const providers = useProviders().data ?? []
  const { provider } = useEditorProvider()

  return (
    <>
      <LongField
        label={t('scenarios.editor.head.title')}
        aside={t('scenarios.editor.head.note')}
        value={head.briefing}
        placeholder={t('scenarios.editor.head.briefingHint')}
        onChange={(briefing) => onHead({ briefing })}
      />
      <div className={styles.chips}>
        <ChoicePicker
          caption={t('scenarios.editor.head.provider')}
          menuLabel={t('scenarios.editor.head.provider')}
          value={provider?.id ?? head.provider}
          // Сценарий можно писать и под провайдера, которого нет на этой машине, но не под
          // провайдера только для чата (ADR 0094): прогон сценария всегда идёт без человека.
          options={providerChoices(providers, t, true).map((one) => ({
            id: one.value,
            label: one.label,
            description: one.description,
            disabled: one.disabled,
          }))}
          onPick={onProvider}
        />
      </div>
      <RunsOn value={head} fallback="newTab" onChange={onHead} />
      <div className={styles.chips}>
        <ChoicePicker
          caption={t('scenarios.editor.head.onQuestion')}
          menuLabel={t('scenarios.editor.head.onQuestion')}
          value={head.onQuestion}
          options={[
            {
              id: 'head',
              label: t('scenarios.editor.head.questionHead'),
              description: t('scenarios.editor.head.questionHeadHint'),
            },
            {
              id: 'stop',
              label: t('scenarios.editor.head.questionStop'),
              description: t('scenarios.editor.head.questionStopHint'),
            },
          ]}
          onPick={(id) => onHead({ onQuestion: id === 'stop' ? 'stop' : 'head' })}
        />
        <ChoicePicker
          caption={t('scenarios.editor.head.onGiveUp')}
          menuLabel={t('scenarios.editor.head.onGiveUp')}
          value={head.onGiveUp}
          options={[
            {
              id: 'stop',
              label: t('scenarios.editor.head.giveUpStop'),
              description: t('scenarios.editor.head.giveUpStopHint'),
            },
            {
              id: 'head',
              label: t('scenarios.editor.head.giveUpHead'),
              description: t('scenarios.editor.head.giveUpHeadHint'),
            },
          ]}
          onPick={(id) => onHead({ onGiveUp: id === 'head' ? 'head' : 'stop' })}
        />
        <ChoicePicker
          caption={t('scenarios.editor.head.retries')}
          menuLabel={t('scenarios.editor.head.retries')}
          value={String(head.retries)}
          options={retryOptions(t)}
          onPick={(id) => onHead({ retries: Number(id) })}
        />
      </div>
    </>
  )
}

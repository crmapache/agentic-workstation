import { useTranslation } from 'react-i18next'

import styles from '../EditorModal.module.scss'
import type { HeadPaneProps } from '../EditorModal.types'
import { retryOptions } from '../EditorModal.utils'
import { ChoicePicker } from './ChoicePicker'
import { LongField } from './LongField'
import { RunsOn } from './RunsOn'

/**
 * Главный поток прогона: брифинг, по которому голова судит каждую карточку, на чём она идёт
 * и как поступает с вопросом карточки, с карточкой, которую не доделали, и сколько раз
 * возвращает на доработку.
 */
export const HeadPane = ({ head, onHead }: HeadPaneProps) => {
  const { t } = useTranslation()

  return (
    <>
      <LongField
        label={t('scenarios.editor.head.title')}
        aside={t('scenarios.editor.head.note')}
        value={head.briefing}
        placeholder={t('scenarios.editor.head.briefingHint')}
        onChange={(briefing) => onHead({ briefing })}
      />
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

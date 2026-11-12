import { Brackets } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { passesOf } from '@shared/scenario-rules'
import type { StageEach } from '@shared/scenarios'

import { Switch } from '@agentic-workstation/ui/Switch'
import { TextField } from '@agentic-workstation/ui/TextField'

import { PER_ITEM } from '../EditorModal.constants'
import styles from '../EditorModal.module.scss'
import type { StageRunsProps } from '../EditorModal.types'
import { isBadName, runOptions, slotMention } from '../EditorModal.utils'
import { blankEach, ITEM_NAME } from '../../scenarios-blank.utils'
import { runsTimes, runsPerItem } from '../../scenarios-editor.utils'
import { ChoicePicker } from './ChoicePicker'
import { LongField } from './LongField'

/**
 * Как ходит этап: число проходов или по проходу на пункт списка, который голова даёт в начале
 * этапа, - для работы, длина которой известна только тогда. У числа - галочка «или меньше»:
 * число остаётся потолком, и ночь по кругу сценарий не проведёт.
 */
export const StageRuns = ({ stage, onStage }: StageRunsProps) => {
  const { t } = useTranslation()
  const { each } = stage
  const passes = passesOf(stage)

  const handleRuns = (id: string) =>
    onStage((one) => (id === PER_ITEM ? runsPerItem(one, blankEach()) : runsTimes(one, Number(id))))

  const handleEach = (patch: Partial<StageEach>) =>
    onStage((one) => ({
      ...one,
      each: { name: one.each?.name ?? '', description: one.each?.description ?? '', ...patch },
    }))

  return (
    <>
      <div className={styles.chips}>
        <ChoicePicker
          caption={t('scenarios.editor.stage.runs')}
          menuLabel={t('scenarios.editor.stage.runsMenu')}
          value={each ? PER_ITEM : String(passes)}
          options={runOptions(t)}
          onPick={handleRuns}
        />
      </div>
      {passes > 1 && !each && (
        <Switch
          label={t('scenarios.editor.stage.untilDone')}
          description={t('scenarios.editor.stage.untilDoneHint')}
          checked={stage.untilDone}
          onChange={(untilDone) => onStage((one) => ({ ...one, untilDone }))}
        />
      )}
      {each && (
        <div className={styles.block}>
          <span className={styles.fieldLabel}>{t('scenarios.editor.stage.list')}</span>
          <TextField
            label={t('scenarios.editor.stage.itemName')}
            icon={Brackets}
            value={each.name}
            placeholder={ITEM_NAME}
            error={isBadName(each.name) ? t('scenarios.editor.badName') : undefined}
            onChange={(name) => handleEach({ name })}
          />
          <LongField
            label={t('scenarios.editor.stage.listLabel')}
            value={each.description}
            placeholder={t('scenarios.editor.stage.listHint')}
            note={t('scenarios.editor.stage.itemNote', {
              slot: slotMention(each.name || ITEM_NAME),
            })}
            onChange={(description) => handleEach({ description })}
          />
        </div>
      )}
    </>
  )
}

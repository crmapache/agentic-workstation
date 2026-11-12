import { useTranslation } from 'react-i18next'

import styles from '../EditorModal.module.scss'
import type { RunsOnProps } from '../EditorModal.types'
import {
  modeTone,
  shownMode,
  modeOptions,
  effortOptions,
  fallbackOption,
} from '../EditorModal.utils'
import { ChoicePicker } from './ChoicePicker'
import { ModelChoice } from './ModelChoice'

/**
 * MODEL, EFFORT и MODE головы или карточки. Пусто у головы - как новый чат Claude Code, у
 * карточки - как голова; у головы режим есть всегда. MODE окрашен, как под
 * полем ввода: режим отвечает за то, что агент делает без спроса, и это видно до чтения.
 */
export const RunsOn = ({ value, fallback, onChange }: RunsOnProps) => {
  const { t } = useTranslation()
  const empty = fallbackOption(t, fallback)
  const mode = shownMode(value.permissionMode, fallback)

  return (
    <div className={styles.chips}>
      <ModelChoice value={value.model} fallback={empty} onPick={(model) => onChange({ model })} />
      <ChoicePicker
        caption={t('scenarios.editor.runsOn.effort')}
        menuLabel={t('scenarios.editor.runsOn.effort')}
        value={value.effort}
        options={effortOptions(t, empty)}
        onPick={(effort) => onChange({ effort })}
      />
      <ChoicePicker
        caption={t('scenarios.editor.runsOn.mode')}
        menuLabel={t('scenarios.editor.runsOn.mode')}
        value={mode}
        tone={modeTone(mode)}
        options={modeOptions(t, fallback === 'head' ? empty : null, mode)}
        onPick={(permissionMode) => onChange({ permissionMode })}
      />
    </div>
  )
}

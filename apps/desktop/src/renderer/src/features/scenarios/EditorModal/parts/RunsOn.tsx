import { useTranslation } from 'react-i18next'

import { providerEfforts } from '@shared/providers'

import { useEditorProvider } from '../editor-provider.context'
import styles from '../EditorModal.module.scss'
import type { RunsOnProps } from '../EditorModal.types'
import {
  modeTone,
  shownMode,
  modeOptions,
  effortOptions,
  fallbackOption,
  scenarioModesOf,
} from '../EditorModal.utils'
import { ChoicePicker } from './ChoicePicker'
import { ModelChoice } from './ModelChoice'

/**
 * MODEL, EFFORT и MODE головы или карточки - списками провайдера сценария. Пусто у головы -
 * как новый чат провайдера, у карточки - как голова; у головы режим есть всегда. MODE окрашен, как под
 * полем ввода: режим отвечает за то, что агент делает без спроса, и это видно до чтения.
 */
export const RunsOn = ({ value, fallback, onChange }: RunsOnProps) => {
  const { t } = useTranslation()
  const empty = fallbackOption(t, fallback)
  const mode = shownMode(value.permissionMode, fallback)
  const { provider, headModel } = useEditorProvider()
  // Карточка с пустой моделью идёт на модели головы - уровни по ней.
  const model = value.model || (fallback === 'head' ? headModel : '')
  const levels = provider ? providerEfforts(provider, model) : undefined

  return (
    <div className={styles.chips}>
      <ModelChoice
        value={value.model}
        fallback={empty}
        onPick={(picked) =>
          onChange({
            model: picked,
            // Уровень, которого у новой модели нет, - к пустому; есть - остаётся.
            ...(provider &&
              !providerEfforts(provider, picked || (fallback === 'head' ? headModel : '')).some(
                (level) => level === value.effort,
              ) && { effort: '' }),
          })
        }
      />
      <ChoicePicker
        caption={t('scenarios.editor.runsOn.effort')}
        menuLabel={t('scenarios.editor.runsOn.effort')}
        value={value.effort}
        options={effortOptions(t, empty, levels)}
        onPick={(effort) => onChange({ effort })}
      />
      <ChoicePicker
        caption={t('scenarios.editor.runsOn.mode')}
        menuLabel={t('scenarios.editor.runsOn.mode')}
        value={mode}
        tone={modeTone(mode)}
        options={modeOptions(
          t,
          fallback === 'head' ? empty : null,
          mode,
          scenarioModesOf(provider),
        )}
        onPick={(permissionMode) => onChange({ permissionMode })}
      />
    </div>
  )
}

import type { SetupPreset } from '@shared/panel-prefs'

/** Часть экрана пресета: сам пресет и правка его полей. */
export type PresetPartProps = {
  preset: SetupPreset
  onChange: (patch: Partial<SetupPreset>) => void
}

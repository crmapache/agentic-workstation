import type { TFunction } from 'i18next'

import type { PanelPrefs } from '@shared/claude-prefs'
import { GAUGE_VIVID_CALM, GAUGE_VIVID_FULL } from '@shared/claude-prefs'

import type { SettingsScreen } from '../claude.types'

/**
 * Значение справа от строки Settings: ответ на вопрос, ради которого экран открыли бы
 * («6 on», «One tone», «From 2 lines»). Пусто у экранов, чьё содержимое в слово не сложить.
 */
export const settingValue = (screen: SettingsScreen, prefs: PanelPrefs, t: TFunction): string => {
  switch (screen) {
    case 'calmColors':
      if (prefs.gaugeVivid === GAUGE_VIVID_FULL) return t('claudeCode.settings.values.fullColor')
      if (prefs.gaugeVivid === GAUGE_VIVID_CALM) return t('claudeCode.settings.values.calm')

      return t('claudeCode.settings.values.percent', { value: prefs.gaugeVivid })
    case 'meters':
      return prefs.hiddenMeters.length > 0
        ? t('claudeCode.settings.values.hidden', { count: prefs.hiddenMeters.length })
        : t('claudeCode.settings.values.all')
    case 'shareEditor':
      return prefs.shareEditor
        ? t('claudeCode.settings.values.on')
        : t('claudeCode.settings.values.off')
    case 'pasteCollapse':
      return prefs.pasteCollapse
        ? t('claudeCode.settings.values.fromLines', { count: prefs.pasteCollapse })
        : t('claudeCode.settings.values.never')
    case 'customModels':
      return prefs.customModels.length > 0
        ? String(prefs.customModels.length)
        : t('claudeCode.settings.values.none')
    default:
      return ''
  }
}

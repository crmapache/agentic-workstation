import type { TFunction } from 'i18next'

import type { PanelCapabilities } from '@shared/panel-capabilities'
import type { PanelPrefs } from '@shared/panel-prefs'
import { GAUGE_VIVID_CALM, GAUGE_VIVID_FULL } from '@shared/panel-prefs'

import type { SettingsScreen } from '../panel.types'

/** Строка, за которой экран того, чего провайдер не умеет (настройки CLI, свои модели), не видна. */
export const offersRow = (screen: SettingsScreen, capabilities: PanelCapabilities): boolean => {
  switch (screen) {
    case 'claudeConfig':
      return capabilities.config
    case 'customModels':
      return capabilities.customModels
    case 'presets':
      return capabilities.presets
    default:
      return true
  }
}

/**
 * Значение справа от строки Settings: ответ на вопрос, ради которого экран открыли бы
 * («6 on», «One tone», «From 2 lines», «2 buttons»). Пусто у экранов, чьё содержимое в слово
 * не сложить.
 */
export const settingValue = (screen: SettingsScreen, prefs: PanelPrefs, t: TFunction): string => {
  switch (screen) {
    case 'calmColors':
      if (prefs.gaugeVivid === GAUGE_VIVID_FULL) return t('agentPanel.settings.values.fullColor')
      if (prefs.gaugeVivid === GAUGE_VIVID_CALM) return t('agentPanel.settings.values.calm')

      return t('agentPanel.settings.values.percent', { value: prefs.gaugeVivid })
    case 'meters':
      return prefs.hiddenMeters.length > 0
        ? t('agentPanel.settings.values.hidden', { count: prefs.hiddenMeters.length })
        : t('agentPanel.settings.values.all')
    case 'shareEditor':
      return prefs.shareEditor
        ? t('agentPanel.settings.values.on')
        : t('agentPanel.settings.values.off')
    case 'pasteCollapse':
      return prefs.pasteCollapse
        ? t('agentPanel.settings.values.fromLines', { count: prefs.pasteCollapse })
        : t('agentPanel.settings.values.never')
    case 'presets':
      return prefs.presetCount > 0
        ? t('agentPanel.settings.values.buttons', { count: prefs.presetCount })
        : t('agentPanel.settings.values.off')
    case 'customModels':
      return prefs.customModels.length > 0
        ? String(prefs.customModels.length)
        : t('agentPanel.settings.values.none')
    default:
      return ''
  }
}

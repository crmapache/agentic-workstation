import { useEffect } from 'react'

import { GAUGE_VIVID_FULL } from '@shared/panel-prefs'

import { usePanelSelected } from './panel-shown.hooks'
import { usePanelPrefs } from './panel.queries'

/**
 * Спокойные шкалы (Settings → No-stress colors): атрибут и доля цвета на корне
 * документа, потому что подменяются наследуемые роли - кольца во всплывающей панели
 * берут их оттуда же. На сотне атрибута нет вовсе: шкалы носят свои роли как есть. Корень
 * один на все панели, а настройка у каждой своя: ставит её только выбранная панель.
 */
export const useGaugeCalm = () => {
  const { gaugeVivid } = usePanelPrefs()
  const isSelected = usePanelSelected()

  useEffect(() => {
    if (!isSelected || gaugeVivid >= GAUGE_VIVID_FULL) return

    const root = document.documentElement

    root.setAttribute('data-gauge-calm', '')
    root.style.setProperty('--gauge-vivid', `${gaugeVivid}%`)

    return () => {
      root.removeAttribute('data-gauge-calm')
      root.style.removeProperty('--gauge-vivid')
    }
  }, [isSelected, gaugeVivid])
}

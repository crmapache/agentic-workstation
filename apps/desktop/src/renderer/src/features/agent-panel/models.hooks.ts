import { useMemo } from 'react'

import type { PickableModel } from './models.types'
import { pickableModels } from './models.utils'
import { usePanelPrefs, useModelCatalog, usePanelCapabilities } from './panel.queries'
import { FALLBACK_MODELS } from './ComposerStatus/ComposerStatus.constants'

/**
 * Модели меню панели: каталог её CLI и свои модели из настроек. Пока каталога нет, запасной
 * список - только у Claude Code: его модели известны и без каталога, а у Codex и открытых
 * моделей меню честно пустое, пока провайдер не ответил.
 */
export const usePickableModels = (): PickableModel[] => {
  const catalog = useModelCatalog()
  const { customModels } = usePanelPrefs()
  const { provider } = usePanelCapabilities()

  return useMemo(
    () => pickableModels(catalog, customModels, provider === 'claude' ? FALLBACK_MODELS : []),
    [catalog, customModels, provider],
  )
}

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { extensionIcon } from '../../lib/extension-icons'
import { extensionKeyLabel } from '../../lib/extension-keys'
import { invoke } from '../../lib/ipc'
import { useExtensions } from '../../state/extensions.queries'
import { useLayoutStore } from '../../state/layout.store'
import type { SearchAction } from '../../features/search-everywhere/search-everywhere.types'

/**
 * Действия расширений в поиске (⌘⇧A, ADR 0091): каждая команда - «Расширение: команда» со своими
 * клавишами, каждый вид - «показать или спрятать».
 */
export const useExtensionSearchActions = (): SearchAction[] => {
  const { t } = useTranslation()
  const { data } = useExtensions()
  const selectMainView = useLayoutStore((state) => state.selectMainView)
  const selectSideView = useLayoutStore((state) => state.selectSideView)

  return useMemo(
    () =>
      (data?.extensions ?? []).flatMap((extension) => {
        const name = extension.manifest?.name ?? extension.id
        const icon = extensionIcon(extension.manifest?.icon)
        const commands: SearchAction[] = extension.contributions.commands.map((command) => ({
          id: `extension.${command.key}`,
          label: t('extensions.actions.command', { extension: name, title: command.title }),
          icon,
          shortcut: command.keys ? extensionKeyLabel(command.keys) : undefined,
          keywords: ['extension', extension.id],
          run: () => void invoke('extensions:runCommand', { key: command.key }),
        }))
        const views: SearchAction[] = extension.contributions.views.map((view) => ({
          id: `extension.view.${view.key}`,
          label: t('searchEverywhere.actions.toggleView', { name: view.title }),
          icon: extensionIcon(view.icon),
          keywords: ['extension', extension.id, name],
          run: () =>
            view.place === 'side'
              ? selectSideView(`ext:${view.key}`)
              : selectMainView(`ext:${view.key}`),
        }))

        return [...commands, ...views]
      }),
    [data, t, selectMainView, selectSideView],
  )
}

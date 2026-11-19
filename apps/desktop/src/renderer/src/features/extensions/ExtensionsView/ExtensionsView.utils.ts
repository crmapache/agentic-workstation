import type { TFunction } from 'i18next'

import type { ExtensionInfo } from '@shared/extensions'

/** Подпись плитки под именем: версия, что внесло, ошибки. */
export const extensionMeta = (extension: ExtensionInfo, t: TFunction): string => {
  const { contributions } = extension
  const parts = [
    extension.manifest ? t('extensions.tile.version', { version: extension.manifest.version }) : '',
    contributions.commands.length
      ? t('extensions.tile.commands', { count: contributions.commands.length })
      : '',
    contributions.views.length
      ? t('extensions.tile.views', { count: contributions.views.length })
      : '',
    contributions.tools.length
      ? t('extensions.tile.tools', { count: contributions.tools.length })
      : '',
    extension.errors ? t('extensions.tile.errors', { count: extension.errors }) : '',
  ]

  return parts.filter(Boolean).join(' · ')
}

/** Ждут одобрения - отдельной группой сверху: человеку надо их решить. */
export const splitByApproval = (extensions: readonly ExtensionInfo[]) => ({
  waiting: extensions.filter((extension) => extension.status === 'needsApproval'),
  rest: extensions.filter((extension) => extension.status !== 'needsApproval'),
})

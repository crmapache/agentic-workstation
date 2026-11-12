import type { TFunction } from 'i18next'

import type { MessageImageWire } from '@agentic-workstation/remote-protocol/wire-types'

import { CommandError } from '../../../state/command-error'

type ImageQuery = { data?: MessageImageWire | undefined; isError: boolean; error: unknown }

/**
 * Строка под фото: что показано не оригинал. Пришло целиком - строки нет; уменьшено под экран -
 * так и сказано; пока идёт - миниатюра и «несу»; не пришло - почему, и что оригинал в IDE.
 */
export const photoCaption = (
  t: TFunction,
  image: ImageQuery,
  hasPreview: boolean,
): string | undefined => {
  if (image.data) return image.data.reduced ? t('photo.reduced') : undefined
  if (!image.isError) return t('photo.loading')

  const reason =
    image.error instanceof CommandError
      ? image.error.code === 'notFound'
        ? t('photo.missing')
        : image.error.detail === 'imageTooBig'
          ? t('photo.tooBig')
          : t('photo.failed')
      : t('photo.failed')

  return hasPreview ? `${reason} ${t('photo.previewShown')}` : reason
}

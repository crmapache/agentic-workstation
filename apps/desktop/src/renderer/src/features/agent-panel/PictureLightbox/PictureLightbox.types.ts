import type { PictureSource } from '../picture.types'

export type PictureLightboxProps = {
  /** Что открыть: картинка за чипом. */
  source: PictureSource
  /** Что на картинке - для скринридера, пока она грузится. */
  label: string
  onClose: () => void
}

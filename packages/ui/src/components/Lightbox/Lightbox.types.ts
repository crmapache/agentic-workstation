import type { IconButtonSize } from '../IconButton/IconButton.types'

export type LightboxProps = {
  open: boolean
  /** Картинка (URL или data URL). null - ещё грузится: вместо неё loadingLabel. */
  src: string | null
  /** Что на картинке - для скринридера и пока она не загрузилась. */
  alt: string
  loadingLabel: string
  /**
   * Картинку не получить (файла нет, сообщение её больше не держит): этот текст встаёт
   * на её место вместо loadingLabel - вечное «грузится» читалось бы поломкой.
   */
  error?: string | undefined
  /**
   * Строка под картинкой: что показано не то, что лежит в оригинале (уменьшено под экран,
   * вместо картинки - миниатюра). Пояснение, а не подпись к содержимому.
   */
  caption?: string | undefined
  closeLabel: string
  /** Размер крестика: md - окно IDE, touch - телефон (под палец). */
  closeSize?: IconButtonSize | undefined
  onClose: () => void
}

import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { FileIcon } from '@agentic-workstation/ui/FileIcon'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { REMOVE_ICON_SIZE } from '../Composer.constants'
import styles from '../Composer.module.scss'
import type { PreparedFile } from '../../../lib/attachments'
import type { PreparedImage } from '../../../lib/images'

/**
 * Вложения над полем: фото превью, файл - иконкой типа и именем. Плитка нажимается вся и
 * убирает вложение - крестик в углу только говорит об этом. Выбранное, которое ещё ужимается
 * (preparing), - плитками с крутилкой в конце ряда: выбор принят, оно вот-вот встанет.
 */
export const AttachmentStrip = ({
  images,
  files,
  preparing,
  onRemoveImage,
  onRemoveFile,
}: {
  images: PreparedImage[]
  files: PreparedFile[]
  preparing: number
  onRemoveImage: (id: string) => void
  onRemoveFile: (id: string) => void
}) => {
  const { t } = useTranslation()
  const mark = (
    <span className={styles.remove}>
      <X size={REMOVE_ICON_SIZE} aria-hidden />
    </span>
  )

  return (
    <div className={styles.strip}>
      {images.map((image, index) => (
        <button
          key={image.id}
          type="button"
          className={styles.tile}
          aria-label={t('composer.removePhoto', { number: index + 1 })}
          onClick={() => onRemoveImage(image.id)}>
          <img className={styles.preview} src={image.preview} alt="" />
          {mark}
        </button>
      ))}
      {files.map((file) => (
        <button
          key={file.id}
          type="button"
          className={styles.fileTile}
          aria-label={t('composer.removeFile', { name: file.name })}
          onClick={() => onRemoveFile(file.id)}>
          <FileIcon path={file.name} kind="file" size="md" />
          <span className={styles.fileName}>{file.name}</span>
          {mark}
        </button>
      ))}
      {Array.from({ length: preparing }, (_, index) => (
        <span key={`preparing-${index}`} className={styles.preparingTile}>
          <Spinner size="md" tone="neutral" label={t('composer.preparing')} />
        </span>
      ))}
    </div>
  )
}

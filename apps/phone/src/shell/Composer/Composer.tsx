import { ArrowUp, ImagePlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useComposer } from './Composer.hooks'
import styles from './Composer.module.scss'
import type { ComposerProps } from './Composer.types'
import { ImageStrip } from './parts/ImageStrip'

/**
 * Поле сообщения с фото: камера или галерея одним выбором системы, отправка кнопкой - Enter на
 * телефоне переносит строку. Пока ход идёт, сообщение встаёт в очередь IDE, а перед «отправить»
 * стоит то, что даёт экран (Stop хода).
 */
export const Composer = ({
  draftKey,
  placeholder,
  sendLabel,
  allowImages = true,
  disabled = false,
  actions,
  onSend,
}: ComposerProps) => {
  const { t } = useTranslation()
  const composer = useComposer({ draftKey, onSend })
  const { text, setText, images, isBusy, fieldRef, fileRef } = composer
  const canSend = !disabled && !isBusy && (text.trim() !== '' || images.length > 0)

  return (
    <div className={styles.composer}>
      {images.length > 0 && <ImageStrip images={images} onRemove={composer.removeImage} />}
      <div className={styles.row}>
        {allowImages && (
          <>
            <IconButton
              icon={ImagePlus}
              size="touch"
              label={t('composer.addPhoto')}
              disabled={disabled}
              onClick={() => fileRef.current?.click()}
            />
            <input
              ref={fileRef}
              className={styles.file}
              type="file"
              accept="image/*"
              multiple
              tabIndex={-1}
              aria-hidden
              onChange={(event) => void composer.handleFiles(event)}
            />
          </>
        )}
        <textarea
          ref={fieldRef}
          className={styles.field}
          rows={1}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
        />
        {actions}
        <IconButton
          icon={ArrowUp}
          size="touch"
          variant="primary"
          label={sendLabel}
          disabled={!canSend}
          onClick={() => void composer.send()}
        />
      </div>
    </div>
  )
}

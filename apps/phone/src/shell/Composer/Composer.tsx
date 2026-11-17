import { ArrowUp, Paperclip } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useComposer } from './Composer.hooks'
import styles from './Composer.module.scss'
import type { ComposerProps } from './Composer.types'
import { AttachmentStrip } from './parts/AttachmentStrip'
import { QuoteList } from './parts/QuoteList'

/**
 * Поле сообщения во всю ширину, под ним ряд кнопок, как в ACC: скрепка слева, справа - то, что
 * даёт экран (Stop хода), и «отправить». Скрепка открывает выбор самой системы: фото, камера,
 * файлы. Над полем - цитаты из ленты и вложения. Enter на телефоне переносит строку, отправка -
 * кнопкой. Пока ход идёт, сообщение встаёт в очередь IDE.
 */
export const Composer = ({
  draftKey,
  placeholder,
  sendLabel,
  allowAttachments = true,
  disabled = false,
  actions,
  onSend,
}: ComposerProps) => {
  const { t } = useTranslation()
  const composer = useComposer({ draftKey, onSend })
  const { text, setText, images, files, isBusy, fieldRef, fileRef } = composer
  const canSend = !disabled && !isBusy && !composer.isEmpty

  return (
    <div className={styles.composer}>
      {composer.quotes.length > 0 && <QuoteList draftKey={draftKey} quotes={composer.quotes} />}
      {(images.length > 0 || files.length > 0) && (
        <AttachmentStrip
          images={images}
          files={files}
          onRemoveImage={composer.removeImage}
          onRemoveFile={composer.removeFile}
        />
      )}
      <textarea
        ref={fieldRef}
        className={styles.field}
        rows={1}
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="enter"
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
      />
      <div className={styles.tools}>
        {allowAttachments && (
          <>
            <IconButton
              icon={Paperclip}
              size="touch"
              label={t('composer.attach')}
              disabled={disabled}
              onClick={() => fileRef.current?.click()}
            />
            {/* Без accept: система сама предлагает фото, камеру и файлы. */}
            <input
              ref={fileRef}
              className={styles.file}
              type="file"
              multiple
              tabIndex={-1}
              aria-hidden
              onChange={(event) => void composer.handlePick(event)}
            />
          </>
        )}
        <span className={styles.toolsGap} />
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

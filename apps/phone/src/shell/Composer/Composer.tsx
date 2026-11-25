import { ArrowUp, Paperclip } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useComposer, useSlashSuggest } from './Composer.hooks'
import styles from './Composer.module.scss'
import type { ComposerProps } from './Composer.types'
import { AttachmentStrip } from './parts/AttachmentStrip'
import { QuoteList } from './parts/QuoteList'
import { SlashSuggest } from './parts/SlashSuggest'

/**
 * Поле сообщения во всю ширину, под ним ряд кнопок, как в ACC: скрепка слева, справа - то, что
 * даёт экран (Stop хода), и «отправить». Скрепка открывает выбор самой системы: фото, камера,
 * файлы. Над полем - цитаты из ленты и вложения, а по «/» - подсказка команд (slash). Enter на
 * телефоне переносит строку, отправка - кнопкой. Пока ход идёт, сообщение встаёт в очередь IDE.
 * Пока выбранное ужимается или сообщение уходит (фото через релей - не мгновенно), «отправить»
 * крутится и не нажимается: видно, что нажатие принято и работа идёт.
 */
export const Composer = ({
  draftKey,
  placeholder,
  sendLabel,
  allowAttachments = true,
  disabled = false,
  actions,
  slash,
  onSend,
}: ComposerProps) => {
  const { t } = useTranslation()
  const composer = useComposer({ draftKey, onSend })
  const { text, setText, images, files, preparing, isBusy, fieldRef, fileRef } = composer
  const suggest = useSlashSuggest(text, setText, fieldRef, disabled ? undefined : slash)
  const isWorking = isBusy || preparing > 0
  const canSend = !disabled && !isWorking && !composer.isEmpty

  return (
    <div className={styles.composer}>
      {composer.quotes.length > 0 && <QuoteList draftKey={draftKey} quotes={composer.quotes} />}
      {(images.length > 0 || files.length > 0 || preparing > 0) && (
        <AttachmentStrip
          images={images}
          files={files}
          preparing={preparing}
          onRemoveImage={composer.removeImage}
          onRemoveFile={composer.removeFile}
        />
      )}
      {suggest.shown && (
        <SlashSuggest state={suggest.shown} onPick={suggest.pick} onDismiss={suggest.dismiss} />
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
        onChange={(event) => {
          setText(event.target.value)
          suggest.track(event.target)
        }}
        onSelect={(event) => suggest.track(event.currentTarget)}
      />
      <div className={styles.tools}>
        {allowAttachments && (
          <>
            <IconButton
              icon={Paperclip}
              size="touch"
              label={t('composer.attach')}
              disabled={disabled || preparing > 0}
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
          busy={isWorking}
          disabled={!canSend}
          onClick={() => void composer.send()}
        />
      </div>
    </div>
  )
}

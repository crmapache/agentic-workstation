import type { ClipboardEvent } from 'react'
import { useMemo, Fragment } from 'react'

import { BREAK_ATTRIBUTE, TOKEN_ATTRIBUTE } from '../UserMessage.constants'
import styles from '../UserMessage.module.scss'
import type { MessageBodyProps } from '../UserMessage.types'
import { pickedTokens, messagePictures, splitParagraphs } from '../UserMessage.utils'
import { clipboardHtml, clipboardTextOf } from '../../draft-clipboard.utils'
import { useFeedScope } from '../../feed-scope.context'
import { pastedOrdinals } from '../../message.utils'
import { LinkedText } from '../../LinkedText/LinkedText'
import { PastedText } from './PastedText'
import { SentChip } from './SentChip'

/**
 * Слова и вложения сообщения ровно как написаны: без разметки и своих переносов, адреса
 * и пути - живыми ссылками, вложения - чипами на своих местах в тексте. Картинка
 * открывается крупно тем же, что показывает под курсором. Выделенное с чипами копируется
 * как из поля ввода: команда и путь текстом, без разрывов строк вокруг плашки, а вставленное
 * обратно в поле снова становится чипами.
 */
export const MessageBody = ({ tokens, messageId, onOpenPicture }: MessageBodyProps) => {
  const { conversationId } = useFeedScope()
  // Номер картинки среди вставленных и что за каждым чипом - раз на сообщение, а не на чип.
  const ordinals = useMemo(() => pastedOrdinals(tokens), [tokens])
  const pictures = useMemo(
    () => messagePictures(tokens, ordinals, conversationId, messageId),
    [tokens, ordinals, conversationId, messageId],
  )

  if (tokens.length === 0) return null

  // Браузер окружал бы плашку переводами строк: её слои - флексы, а их он копирует абзацами.
  const handleCopy = (event: ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection()
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
    const picked = range ? pickedTokens(event.currentTarget, range, tokens) : null

    if (!picked) return

    event.preventDefault()
    event.clipboardData.setData('text/plain', clipboardTextOf(picked))
    event.clipboardData.setData('text/html', clipboardHtml(picked))
  }

  return (
    <div className={styles.body} onCopy={handleCopy}>
      {tokens.map((token, index) => {
        // Пустая строка между абзацами - коротким зазором, а не высотой целой строки.
        if (token.kind === 'text') {
          return (
            <Fragment key={index}>
              {splitParagraphs(token.value).map((paragraph, part) => (
                <Fragment key={part}>
                  {part > 0 && (
                    <span
                      className={styles.paragraphGap}
                      {...{ [BREAK_ATTRIBUTE]: '' }}
                      aria-hidden
                    />
                  )}
                  <LinkedText text={paragraph} />
                </Fragment>
              ))}
            </Fragment>
          )
        }

        const picture = pictures[index] ?? null
        const openPicture = picture ? () => onOpenPicture(picture, token.chip) : undefined

        // Обёртка без своей коробки: только метка куска для копии выделенного.
        return (
          <span key={index} className={styles.token} {...{ [TOKEN_ATTRIBUTE]: index }}>
            {token.chip.kind === 'paste' ? (
              <PastedText chip={token.chip} isBlock={index === tokens.length - 1} />
            ) : (
              <SentChip chip={token.chip} picture={picture} onOpen={openPicture} />
            )}
          </span>
        )
      })}
    </div>
  )
}

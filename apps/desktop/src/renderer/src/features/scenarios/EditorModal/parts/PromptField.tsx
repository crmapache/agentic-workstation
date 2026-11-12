import type { UIEvent } from 'react'
import { useRef } from 'react'

import { BACKDROP_TAIL } from '../EditorModal.constants'
import styles from '../EditorModal.module.scss'
import type { PromptFieldProps } from '../EditorModal.types'
import { promptPieces } from '../../scenarios-editor.utils'

/**
 * Промпт карточки - единственное поле редактора, которое уходит агенту, и единственное
 * моноширинное. Имена в нём подсвечены: `{{вопрос}}` и `[[слот]]` - всё, что делает сценарий
 * больше списка поручений, и опечатка в имени видна в момент набора. Свет - подложкой под
 * прозрачным textarea (PromptField в ACC): поле остаётся полем, с выделением и отменой.
 */
export const PromptField = ({ id, value, placeholder, onChange }: PromptFieldProps) => {
  const backRef = useRef<HTMLDivElement>(null)

  // Длинный промпт крутится внутри поля - подложка идёт следом, иначе свет уедет от букв.
  const handleScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    const back = backRef.current

    if (!back) return

    back.scrollTop = event.currentTarget.scrollTop
    back.scrollLeft = event.currentTarget.scrollLeft
  }

  return (
    <div className={styles.prompt}>
      <div ref={backRef} className={styles.promptBack} aria-hidden>
        {promptPieces(value).map((piece, index) =>
          piece.kind === 'text' ? (
            piece.text
          ) : (
            <span
              key={index}
              className={piece.kind === 'input' ? styles.promptInput : styles.promptSlot}>
              {piece.text}
            </span>
          ),
        )}
        {BACKDROP_TAIL}
      </div>
      <textarea
        id={id}
        className={styles.promptField}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onScroll={handleScroll}
      />
    </div>
  )
}

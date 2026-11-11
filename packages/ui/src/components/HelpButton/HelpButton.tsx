import { useState } from 'react'
import { CircleHelp } from 'lucide-react'

import { IconButton } from '../IconButton/IconButton'
import { Modal } from '../Modal/Modal'
import styles from './HelpButton.module.scss'
import type { HelpButtonProps } from './HelpButton.types'
import { helpParagraphs } from './HelpButton.utils'

/**
 * Кнопка «?» у правого края шапки вида, раздела, карточки или окна: пояснение открывается окном, а не
 * лежит абзацем в интерфейсе. На виду остаются подписи, состояния и ошибки, а что это и
 * как работает - здесь. Окно справки встаёт и поверх другого окна.
 */
export const HelpButton = ({ label, title, text, closeLabel }: HelpButtonProps) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <IconButton icon={CircleHelp} size="sm" label={label} onClick={() => setIsOpen(true)} />
      <Modal
        open={isOpen}
        icon={CircleHelp}
        iconTone="info"
        title={title}
        closeLabel={closeLabel}
        onClose={() => setIsOpen(false)}>
        <div className={styles.text}>
          {helpParagraphs(text).map((paragraph, index) => (
            <p key={index} className={styles.paragraph}>
              {paragraph}
            </p>
          ))}
        </div>
      </Modal>
    </>
  )
}

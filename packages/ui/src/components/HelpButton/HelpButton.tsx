import { useState } from 'react'
import { CircleHelp } from 'lucide-react'

import { IconButton } from '../IconButton/IconButton'
import { Modal } from '../Modal/Modal'
import styles from './HelpButton.module.scss'
import type { HelpButtonProps } from './HelpButton.types'
import { helpChunks, helpParagraphs } from './HelpButton.utils'

/**
 * Кнопка «?» у правого края шапки вида, раздела, карточки или окна: пояснение открывается окном, а не
 * лежит абзацем в интерфейсе. На виду остаются подписи, состояния и ошибки, а что это и
 * как работает - здесь. Окно справки встаёт и поверх другого окна. Крестик окна - того же
 * размера, что сама кнопка: на телефоне под палец и он. Адрес https в тексте - ссылка наружу
 * (условия сервиса, документация).
 */
export const HelpButton = ({ label, title, text, closeLabel, size = 'sm' }: HelpButtonProps) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <IconButton icon={CircleHelp} size={size} label={label} onClick={() => setIsOpen(true)} />
      <Modal
        open={isOpen}
        icon={CircleHelp}
        iconTone="info"
        title={title}
        closeLabel={closeLabel}
        closeSize={size}
        onClose={() => setIsOpen(false)}>
        <div className={styles.text}>
          {helpParagraphs(text).map((paragraph, index) => (
            <p key={index} className={styles.paragraph}>
              {helpChunks(paragraph).map((chunk, at) =>
                chunk.kind === 'url' ? (
                  // Наружу, в браузер человека: окно IDE перехватывает _blank и отдаёт адрес
                  // системе, а не уводит страницу по ссылке.
                  <a
                    key={at}
                    className={styles.link}
                    href={chunk.text}
                    target="_blank"
                    rel="noreferrer">
                    {chunk.text}
                  </a>
                ) : (
                  chunk.text
                ),
              )}
            </p>
          ))}
        </div>
      </Modal>
    </>
  )
}

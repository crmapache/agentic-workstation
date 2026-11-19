import { useMemo } from 'react'

import { useKnownFiles } from '../paths.hooks'
import { splitLinks } from '../paths.utils'
import { PathLink } from '../PathLink/PathLink'
import { RevealText } from '../RevealText/RevealText'
import styles from './LinkedText.module.scss'
import type { LinkedTextProps } from './LinkedText.types'

/**
 * Текст ровно как пришёл, но с живыми ссылками: для мест, где разметку разбирать
 * нельзя, - своё сообщение (звёздочки там значат сами себя), строка ошибки, вывод
 * процесса. Адрес сайта открывается в браузере, путь - в IDE (PathLink). Отдаёт
 * строчные куски: переносы строк и обёртку держит вызывающий.
 */
export const LinkedText = ({ text, pathTone }: LinkedTextProps) => {
  const known = useKnownFiles()
  const chunks = useMemo(() => splitLinks(text, known), [text, known])

  return chunks.map((chunk, index) => {
    switch (chunk.kind) {
      case 'url':
        // Наружу, в браузер человека: окно перехватывает _blank и отдаёт адрес главному
        // процессу (openExternalWeb), а не уводит панель по ссылке.
        return (
          <a key={index} className={styles.link} href={chunk.text} target="_blank" rel="noreferrer">
            {chunk.text}
          </a>
        )
      case 'path':
        return (
          <PathLink key={index} request={chunk.request} folder={chunk.folder} tone={pathTone}>
            {chunk.text}
          </PathLink>
        )
      case 'text':
        // Простой кусок - через RevealText: у печатающегося ответа он проступает волной.
        return <RevealText key={index}>{chunk.text}</RevealText>
    }
  })
}

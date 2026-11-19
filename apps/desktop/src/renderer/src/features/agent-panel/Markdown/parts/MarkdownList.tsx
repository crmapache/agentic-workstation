import { ChoiceMark } from '@agentic-workstation/ui/ChoiceMark'

import styles from '../Markdown.module.scss'
import type { MarkdownListProps } from '../Markdown.types'
import { listItemMarker } from '../Markdown.utils'
import { MarkdownBlocks } from './MarkdownBlocks'

/**
 * Список, как в ACC: у маркированного пункта - длинное тире, у нумерованного - номер
 * из исходника. Маркер - своя колонка: длинный номер («10.») не залезает влево, а
 * перенесённые строки пункта встают ровно под текстом. У пункта-дела вместо маркера -
 * квадрат, у сделанного - галочка; нажать на него нельзя, это ответ, а не форма.
 */
export const MarkdownList = ({ list }: MarkdownListProps) => {
  const items = list.items.map((item, index) => (
    <li key={index} className={styles.listItem}>
      {item.task ? (
        <span className={styles.checkbox}>
          <ChoiceMark shape="square" tone="success" checked={Boolean(item.checked)} />
        </span>
      ) : (
        <span className={styles.marker} aria-hidden={list.ordered ? undefined : true}>
          {listItemMarker(list, item, index)}
        </span>
      )}
      <div className={styles.listContent}>
        <MarkdownBlocks tokens={item.tokens.filter((token) => token.type !== 'checkbox')} />
      </div>
    </li>
  ))

  return list.ordered ? (
    <ol className={styles.list} start={typeof list.start === 'number' ? list.start : undefined}>
      {items}
    </ol>
  ) : (
    <ul className={styles.list}>{items}</ul>
  )
}

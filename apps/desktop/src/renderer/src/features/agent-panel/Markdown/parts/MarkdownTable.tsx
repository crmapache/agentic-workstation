import clsx from 'clsx'

import { ALIGN_CLASS } from '../Markdown.constants'
import styles from '../Markdown.module.scss'
import type { MarkdownTableProps } from '../Markdown.types'
import { MarkdownInline } from './MarkdownInline'

/**
 * Таблица из ответа. Широкая прокручивается вбок внутри своей рамки: панель узкая, а
 * ломать колонки по словам хуже, чем дать её прокрутить.
 */
export const MarkdownTable = ({ table }: MarkdownTableProps) => {
  const alignClass = (index: number) => {
    const align = table.align[index]
    const key = align ? ALIGN_CLASS[align] : null

    return key ? styles[key] : undefined
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {table.header.map((cell, index) => (
              <th key={index} className={clsx(styles.headCell, alignClass(index))}>
                <MarkdownInline tokens={cell.tokens} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) => (
                <td key={index} className={clsx(styles.cell, alignClass(index))}>
                  <MarkdownInline tokens={cell.tokens} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

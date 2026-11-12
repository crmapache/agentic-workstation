import { useTranslation } from 'react-i18next'

import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Section } from '@agentic-workstation/ui/Section'

import { SHELF_WORDS } from '../LibraryTab.constants'
import styles from '../LibraryTab.module.scss'
import type { ShelfProps } from '../LibraryTab.types'
import { shelfEntries } from '../../scenarios-shelves.utils'
import { shortcutLabel } from '../../../../lib/keys'
import { EmptyShelf } from './EmptyShelf'
import { ShelfRow } from './ShelfRow'
import { ShelfSlot } from './ShelfSlot'

/**
 * Одна полка - раздел вида: заголовок, сколько на ней, «?» с тем, что она значит, и строки по
 * порядку с местом под несомую строку. Несомая строка остаётся на своём месте спрятанной - в том
 * же списке и с тем же ключом: узел, за который держится жест, React не пересоздаёт. Пустая
 * полка во время переноса - рамка ровно роста несомой: граница полок не едет под рукой.
 */
export const Shelf = ({ scope, keys, byKey, carried, slot, kit }: ShelfProps) => {
  const { t } = useTranslation()
  const words = SHELF_WORDS[scope]
  const title = t(words.title)
  const entries = shelfEntries(keys, carried?.key ?? null, slot)
  const isEmpty = entries.every((entry) => entry.kind === 'row' && entry.hidden)

  return (
    <div className={styles.shelf} data-shelf-heading={scope}>
      <Section
        title={title}
        count={keys.length}
        help={
          <HelpButton
            label={t('scenarios.library.help.label')}
            title={title}
            text={t(words.help, { up: shortcutLabel('⌥↑'), down: shortcutLabel('⌥↓') })}
            closeLabel={t('common.close')}
          />
        }>
        <div className={styles.rows}>
          {isEmpty && !carried && <EmptyShelf scope={scope} onCreate={kit.actions.create} />}
          {isEmpty && carried && <ShelfSlot height={carried.height} target={false} />}
          {entries.map((entry) => {
            if (entry.kind === 'slot')
              return <ShelfSlot key="slot" height={carried?.height ?? 0} target />

            const scenario = byKey.get(entry.key)

            return (
              scenario && (
                <ShelfRow
                  key={entry.key}
                  scenario={scenario}
                  rowKey={entry.key}
                  shelf={scope}
                  hidden={entry.hidden}
                  kit={kit}
                />
              )
            )
          })}
        </div>
      </Section>
    </div>
  )
}

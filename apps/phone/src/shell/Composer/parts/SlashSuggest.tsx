import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { ListBox } from '@agentic-workstation/ui/ListBox'
import { ListBoxOption } from '@agentic-workstation/ui/ListBoxOption'

import { SUGGEST_LIST_ID } from '../Composer.constants'
import styles from '../Composer.module.scss'
import { keepFieldFocus } from '../Composer.utils'
import type { SlashRow, SlashState } from '../../../lib/slash.utils'

/**
 * Подсказка «/» над полем, как в ACC на телефоне: шапка - что за список и сколько из скольких,
 * крестик закрывает его до следующей буквы; строки под палец - имя и пояснение второй строкой,
 * встроенная команда помечена справа. Касание строки ставит команду (или значение) в поле.
 */
export const SlashSuggest = ({
  state,
  onPick,
  onDismiss,
}: {
  state: SlashState
  onPick: (row: SlashRow) => void
  onDismiss: () => void
}) => {
  const { t } = useTranslation()
  const isCommands = state.kind === 'commands'

  return (
    <div className={styles.suggest}>
      <div className={styles.suggestHead}>
        <span className={styles.suggestTitle}>
          {isCommands ? t('composer.slash.commands') : t('composer.slash.values')}
        </span>
        <span className={styles.suggestCount}>
          {t('composer.slash.count', { shown: state.rows.length, total: state.total })}
        </span>
        <IconButton
          icon={X}
          size="touch"
          label={t('composer.slash.close')}
          onMouseDown={keepFieldFocus}
          onClick={onDismiss}
        />
      </div>
      <ListBox
        id={SUGGEST_LIST_ID}
        label={
          isCommands
            ? t('composer.slash.commands')
            : t('composer.slash.valuesOf', { command: state.command })
        }>
        {state.rows.map((row, index) => (
          <ListBoxOption
            key={row.id}
            id={`${SUGGEST_LIST_ID}-${index}`}
            size="touch"
            label={row.label}
            highlight={row.marks}
            description={row.description || undefined}
            hint={row.group === 'built-in' ? t('composer.slash.builtIn') : undefined}
            active={false}
            onSelect={() => onPick(row)}
            onActivate={() => undefined}
          />
        ))}
      </ListBox>
    </div>
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DEFAULT_PASTE_COLLAPSE } from '@shared/claude-prefs'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useClaudeActions } from '../claude-actions.hooks'
import { usePanelPrefs } from '../claude.queries'
import { PanelScreen } from '../PanelScreen/PanelScreen'
import {
  GUARD_THOUSANDS,
  PASTE_COLLAPSE_MAX,
  PASTE_COLLAPSE_MIN,
} from './PasteCollapseScreen.constants'
import styles from './PasteCollapseScreen.module.scss'
import { clampPasteCollapse } from './PasteCollapseScreen.utils'

/**
 * Settings → Pasted text: с какого числа строк вставка сворачивается в чип (как в ACC).
 * «Никогда» - со своим исключением на виду: вставка больше предохранителя сворачивается
 * всё равно. Число набирается, а не выбирается из лесенки; при «никогда» поле остаётся
 * видно - по нему понятно, к чему вернётся сворачивание.
 */
export const PasteCollapseScreen = () => {
  const { t } = useTranslation()
  const { pasteCollapse } = usePanelPrefs()
  const { setPrefs } = useClaudeActions()
  const never = pasteCollapse === 0
  const [typed, setTyped] = useState(() => String(pasteCollapse || DEFAULT_PASTE_COLLAPSE))
  const fallback = pasteCollapse || DEFAULT_PASTE_COLLAPSE

  const save = (value: string) => {
    const lines = clampPasteCollapse(value, fallback)

    setTyped(String(lines))
    void setPrefs({ pasteCollapse: lines })
  }

  // Цифры без поправки на лету: «5», прыгнувшее в «500» на второй цифре, мешало бы набору.
  const handleTyped = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 3)
    const lines = Number.parseInt(digits, 10)

    setTyped(digits)

    if (lines >= PASTE_COLLAPSE_MIN && lines <= PASTE_COLLAPSE_MAX) {
      void setPrefs({ pasteCollapse: lines })
    }
  }

  return (
    <PanelScreen title={t('claudeCode.menu.titles.pasteCollapse.title')}>
      <Menu label={t('claudeCode.menu.titles.pasteCollapse.title')} autoFocus>
        <MenuItem
          selection="single"
          checked={never}
          label={t('claudeCode.pasteCollapse.never')}
          description={t('claudeCode.pasteCollapse.neverSub', { thousands: GUARD_THOUSANDS })}
          onSelect={() => void setPrefs({ pasteCollapse: 0 })}
        />
        <MenuItem
          selection="single"
          checked={!never}
          label={t('claudeCode.pasteCollapse.fold')}
          description={t('claudeCode.pasteCollapse.foldSub', {
            min: PASTE_COLLAPSE_MIN,
            max: PASTE_COLLAPSE_MAX,
          })}
          onSelect={() => save(typed)}
        />
      </Menu>
      <div className={styles.lines}>
        <TextField
          label={t('claudeCode.pasteCollapse.lines')}
          inputMode="numeric"
          spellCheck={false}
          disabled={never}
          value={typed}
          onChange={handleTyped}
          onBlur={() => save(typed)}
        />
      </div>
    </PanelScreen>
  )
}

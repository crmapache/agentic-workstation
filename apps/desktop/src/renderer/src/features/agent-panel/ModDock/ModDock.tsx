import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../panel.constants'
import styles from './ModDock.module.scss'
import type { ModDockProps } from './ModDock.types'
import { paneName } from './ModDock.utils'

/**
 * Что говорят моды CLI (2.1.287+), над полем (как в ACC): всплывашка (гаснет сама), строка
 * статуса на мод и слово о каждом окне, которое мод держит открытым. Окна панель
 * нарисовать не может - а мод, держащий вызов на своих кнопках, оставлял бы ход стоять
 * без объяснения: поэтому «мод держит окно, Stop отменит». Без модов карточки нет.
 */
export const ModDock = ({ mods }: ModDockProps) => {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  const toast = mods?.toast ?? null
  const toastLeft = toast ? toast.until - now : 0

  // Всплывашка гаснет по своему сроку: ничто другое карточку в этот момент не перерисует.
  useEffect(() => {
    if (!toast || toastLeft <= 0) return

    const timer = window.setTimeout(() => setNow(Date.now()), toastLeft)

    return () => window.clearTimeout(timer)
  }, [toast, toastLeft])

  const lines = Object.entries(mods?.status ?? {})
  const panes = mods?.panes ?? []
  const isToasting = toast !== null && toastLeft > 0

  if (!isToasting && lines.length === 0 && panes.length === 0) return null

  return (
    <section className={styles.modDock} role="status" aria-label={t('agentPanel.mods.label')}>
      <span className={styles.label}>{t('agentPanel.mods.label')}</span>
      {isToasting && (
        <div className={clsx(styles.row, styles.toast)}>
          <span className={styles.name}>{toast.plugin}</span>
          <span className={styles.text}>{toast.text}</span>
        </div>
      )}
      {lines.map(([plugin, text]) => (
        <div key={plugin} className={styles.row}>
          <span className={styles.name}>{plugin}</span>
          <span className={styles.text}>{text}</span>
        </div>
      ))}
      {panes.map((pane) => (
        <div key={pane.id} className={clsx(styles.row, styles.pane)}>
          <TriangleAlert
            className={styles.paneIcon}
            size={ROW_ICON_SIZE}
            strokeWidth={ROW_ICON_STROKE}
            aria-hidden
          />
          <span className={styles.text}>{t('agentPanel.mods.pane', { name: paneName(pane) })}</span>
        </div>
      ))}
    </section>
  )
}

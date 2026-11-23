import { clsx } from 'clsx'
import { useTranslation } from 'react-i18next'

import { Switch } from '@agentic-workstation/ui/Switch'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../SourcesPanel.module.scss'
import type { SourceRowProps } from '../SourcesPanel.types'
import { sourceStatus } from '../SourcesPanel.utils'
import { useCalendarActions } from '../../calendar.actions'
import { momentLabel } from '../../../../lib/dates.utils'
import { SourceMenu } from './SourceMenu'

/** Источник в списке: точка цвета, имя, что с синком, «показывать» и меню действий. */
export const SourceRow = ({ source, now }: SourceRowProps) => {
  const { t } = useTranslation()
  const { patch } = useCalendarActions()
  const status = sourceStatus(source)
  const words = {
    today: t('calendar.days.today'),
    tomorrow: t('calendar.days.tomorrow'),
    yesterday: t('calendar.days.yesterday'),
  }
  const when = source.sync.lastOkAt === null ? '' : momentLabel(source.sync.lastOkAt, now, words)
  const text = t(status.key as never, { ...status.values, when })

  return (
    <li className={clsx(styles.row, !source.visible && styles.hidden)}>
      <span className={clsx(styles.dot, styles[`tone${source.color}`])} />
      <div className={styles.text}>
        <span className={styles.name}>{source.name}</span>
        <Tooltip label={text}>
          <span className={clsx(styles.status, styles[status.tone])}>{text}</span>
        </Tooltip>
      </div>
      <Switch
        label={t('calendar.sources.show', { name: source.name })}
        labelHidden
        checked={source.visible}
        onChange={(visible) => void patch(source.id, { visible })}
      />
      <SourceMenu source={source} />
    </li>
  )
}

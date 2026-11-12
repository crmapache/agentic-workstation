import { Copy, Clock, Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../LibraryTab.module.scss'
import type { ShelfRowActionsProps } from '../LibraryTab.types'
import { whenLabel } from '../../scenarios-hours.utils'
import { comingHours } from '../../scenarios-shelves-facts.utils'

/**
 * Что делают со сценарием: Run (у сломанного - «Fix it», в редактор), а отдельно от него -
 * час, правка, копия и удаление. Run не гаснет от другого прогона: один сценарий можно ставить
 * сколько угодно раз. Часы горят, когда у сценария они есть.
 */
export const ShelfRowActions = ({ scenario, facts, hours, actions }: ShelfRowActionsProps) => {
  const { t } = useTranslation()
  const next = comingHours(hours)[0]

  return (
    <span className={styles.actions}>
      <Button
        size="sm"
        variant={facts.broken ? 'secondary' : 'primary'}
        onClick={() => (facts.broken ? actions.edit(scenario) : actions.run(scenario))}>
        {facts.broken ? t('scenarios.library.fix') : t('scenarios.library.run')}
      </Button>
      <span className={styles.icons}>
        <IconButton
          icon={Clock}
          size="sm"
          label={
            next === undefined
              ? t('scenarios.library.schedule')
              : t('scenarios.library.scheduleNext', { when: whenLabel(next) })
          }
          {...(hours.length > 0 && { active: true })}
          aria-disabled={facts.broken}
          onClick={() => actions.schedule(scenario)}
        />
        <IconButton
          icon={Pencil}
          size="sm"
          label={t('scenarios.library.edit')}
          onClick={() => actions.edit(scenario)}
        />
        <IconButton
          icon={Copy}
          size="sm"
          label={t('scenarios.library.duplicate')}
          onClick={() => actions.duplicate(scenario)}
        />
        <IconButton
          icon={Trash2}
          size="sm"
          label={t('scenarios.library.delete')}
          onClick={() => actions.remove(scenario)}
        />
      </span>
    </span>
  )
}

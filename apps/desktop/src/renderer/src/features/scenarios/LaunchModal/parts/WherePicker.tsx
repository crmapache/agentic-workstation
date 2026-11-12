import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { SelectField } from '@agentic-workstation/ui/SelectField'

import styles from '../LaunchModal.module.scss'
import type { LaunchPartProps } from '../LaunchModal.types'
import { liveOf, queueStatus } from '../../scenarios-queues.utils'
import { useStatusWord, useWorkdirWord } from '../../QueueCard/QueueCard.hooks'
import { WhereOptions } from './WhereOptions'

/**
 * Куда поставить сценарий: новая очередь (своя линия работы, идёт параллельно с остальными)
 * или открытая очередь проекта - тогда он пойдёт после того, что в ней уже стоит. У каждой
 * очереди в списке - где она работает и что делает сейчас.
 */
export const WherePicker = ({ form }: LaunchPartProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const statusWord = useStatusWord()
  const workdirWord = useWorkdirWord()
  const { target } = form
  const chosen =
    target.kind === 'queue' ? form.queues.find((queue) => queue.id === target.queueId) : undefined

  return (
    <div className={styles.group}>
      <SelectField
        {...popover.triggerProps}
        label={t('scenarios.launch.where')}
        value={chosen?.name ?? t('scenarios.launch.newQueue')}
      />
      <Popover {...popover.popoverProps} width="field">
        {popover.isOpen && (
          <Menu label={t('scenarios.launch.where')} autoFocus>
            <MenuItem
              icon={Plus}
              label={t('scenarios.launch.newQueue')}
              selection="single"
              checked={target.kind === 'new'}
              onSelect={() => form.setWhere({ kind: 'new' })}
            />
            {form.queues.length > 0 && (
              <MenuSection title={t('scenarios.launch.addTo')}>
                {form.queues.map((queue) => (
                  <MenuItem
                    key={queue.id}
                    label={queue.name}
                    description={t('scenarios.launch.queueFacts', {
                      place: workdirWord(queue.workdir),
                      state: statusWord(queueStatus(queue, liveOf(queue, form.live))),
                    })}
                    selection="single"
                    checked={chosen?.id === queue.id}
                    onSelect={() => form.setWhere({ kind: 'queue', queueId: queue.id })}
                  />
                ))}
              </MenuSection>
            )}
          </Menu>
        )}
      </Popover>
      <WhereOptions form={form} />
    </div>
  )
}

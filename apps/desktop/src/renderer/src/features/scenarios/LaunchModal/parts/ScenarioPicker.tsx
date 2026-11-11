import { useTranslation } from 'react-i18next'

import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import styles from '../LaunchModal.module.scss'
import type { LaunchPartProps } from '../LaunchModal.types'
import { shelvesOf } from '../LaunchModal.utils'
import { ScenarioAlert } from '../../ScenarioAlert/ScenarioAlert'
import { ScenarioOptions } from './ScenarioOptions'

/**
 * Какой сценарий запустить - список по полкам, как в Library. Сценарий, которому мешают
 * проблемы, в списке есть, но погашен с причиной: человек видит, что он не потерялся.
 */
export const ScenarioPicker = ({ form }: LaunchPartProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const { project, user } = shelvesOf(form.scenarios)

  return (
    <>
      <div className={styles.picker}>
        <DropdownButton
          {...popover.triggerProps}
          label={form.scenario?.name ?? t('scenarios.launch.choose')}
          menuLabel={t('scenarios.launch.scenario')}
          data-autofocus={form.scenario ? undefined : true}
        />
      </div>
      <Popover {...popover.popoverProps} width="lg">
        {popover.isOpen && (
          <Menu label={t('scenarios.launch.scenario')} autoFocus>
            <ScenarioOptions
              title={t('scenarios.launch.inProject')}
              scenarios={project}
              form={form}
            />
            <ScenarioOptions title={t('scenarios.launch.inEvery')} scenarios={user} form={form} />
          </Menu>
        )}
      </Popover>
      {form.isBroken && <ScenarioAlert>{t('scenarios.launch.broken')}</ScenarioAlert>}
    </>
  )
}

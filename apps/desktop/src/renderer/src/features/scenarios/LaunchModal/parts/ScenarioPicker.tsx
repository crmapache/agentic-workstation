import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { SelectField } from '@agentic-workstation/ui/SelectField'

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
    <div className={styles.group}>
      <SelectField
        {...popover.triggerProps}
        label={t('scenarios.launch.scenario')}
        value={form.scenario?.name ?? null}
        placeholder={t('scenarios.launch.choose')}
        data-autofocus={form.scenario ? undefined : true}
      />
      <Popover {...popover.popoverProps} width="field">
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
    </div>
  )
}

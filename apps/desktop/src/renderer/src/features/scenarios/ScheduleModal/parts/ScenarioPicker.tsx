import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { SelectField } from '@agentic-workstation/ui/SelectField'

import styles from '../ScheduleModal.module.scss'
import type { ScenarioPickerProps } from '../ScheduleModal.types'

/**
 * Какой сценарий ставится на час, когда окно открыли не со строки сценария: меню по полкам -
 * проект и личные. В нём только то, что запустится: сломанный сценарий в назначенный час
 * упал бы ночью без свидетелей.
 */
export const ScenarioPicker = ({ scenarios, value, onPick }: ScenarioPickerProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const label = t('scenarios.schedule.form.scenario')
  const shelves = [
    { scope: 'project', title: t('scenarios.library.project') },
    { scope: 'user', title: t('scenarios.library.user') },
  ] as const

  return (
    <div className={styles.field}>
      {scenarios.length === 0 ? (
        <>
          <span className={styles.caption}>{label}</span>
          <span className={styles.hint}>{t('scenarios.schedule.form.noScenarios')}</span>
        </>
      ) : (
        <SelectField
          {...popover.triggerProps}
          label={label}
          value={value?.name ?? null}
          placeholder={t('scenarios.schedule.form.choose')}
          data-autofocus
        />
      )}
      <Popover {...popover.popoverProps} width="field">
        {popover.isOpen && (
          <Menu label={label} autoFocus>
            {shelves.map(({ scope, title }) => {
              const own = scenarios.filter((one) => one.scope === scope)

              return (
                own.length > 0 && (
                  <MenuSection key={scope} title={title}>
                    {own.map((scenario) => (
                      <MenuItem
                        key={scenario.id}
                        label={scenario.name}
                        selection="single"
                        checked={scenario.id === value?.id && scope === value.scope}
                        onSelect={() => {
                          popover.close()
                          onPick(scenario)
                        }}
                      />
                    ))}
                  </MenuSection>
                )
              )
            })}
          </Menu>
        )}
      </Popover>
    </div>
  )
}

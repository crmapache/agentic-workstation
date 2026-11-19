import { useTranslation } from 'react-i18next'

import { Section } from '@agentic-workstation/ui/Section'

import type { useStartScenario } from '../StartScenarioScreen.hooks'
import styles from '../StartScenarioScreen.module.scss'
import { unattendedProviderOptions } from '../../../../lib/options.utils'
import { OptionList } from '../../../../shell/OptionList/OptionList'

const NEW = 'new'

/**
 * Куда поставить: новая очередь (своя worktree - работа не трогает файлы проекта) или в конец
 * открытой очереди - там сценарий стартует, когда предыдущий сделан. И провайдер, если их больше
 * одного; кто только для своего чата (ADR 0094), виден погашенным.
 */
export const TargetPicker = ({ start }: { start: ReturnType<typeof useStartScenario> }) => {
  const { t } = useTranslation()
  const { form, update, openQueues, providers } = start
  const target = form.target.kind === 'new' ? NEW : form.target.queueId
  const providerOptions = unattendedProviderOptions(t, providers)

  return (
    <>
      <Section size="sm" title={t('start.where')}>
        <div className={styles.group}>
          <OptionList
            label={t('start.where')}
            options={[
              { value: NEW, label: t('start.newQueue') },
              ...openQueues.map((queue) => ({
                value: queue.id,
                label: queue.name,
                description:
                  queue.workdir.kind === 'worktree'
                    ? queue.workdir.gitBranch
                    : t('queue.projectFolder'),
              })),
            ]}
            isSelected={(value) => value === target}
            onSelect={(value) =>
              update({
                target: value === NEW ? { kind: 'new' } : { kind: 'queue', queueId: value },
              })
            }
          />
          {form.target.kind === 'new' && (
            <OptionList
              label={t('start.options')}
              shape="square"
              options={[
                {
                  value: 'worktree',
                  label: t('start.worktree'),
                  description: t('start.worktreeHint'),
                },
              ]}
              isSelected={() => form.worktree}
              onSelect={() => update({ worktree: !form.worktree })}
            />
          )}
        </div>
      </Section>
      {providerOptions.length > 1 && (
        <Section size="sm" title={t('newConversation.provider')}>
          <OptionList
            label={t('newConversation.provider')}
            options={providerOptions}
            isSelected={(value) => value === start.provider}
            onSelect={(value) => update({ provider: value })}
          />
        </Section>
      )}
    </>
  )
}

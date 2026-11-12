import { useTranslation } from 'react-i18next'

import { Section } from '@agentic-workstation/ui/Section'

import type { useStartScenario } from '../StartScenarioScreen.hooks'
import styles from '../StartScenarioScreen.module.scss'
import { OptionList } from '../../../../shell/OptionList/OptionList'

const NEW = 'new'

/**
 * Куда поставить: новая очередь (своя worktree - работа не трогает файлы проекта) или в конец
 * открытой очереди (и запускать ли только после успеха предыдущего). И провайдер, если их больше
 * одного.
 */
export const TargetPicker = ({ start }: { start: ReturnType<typeof useStartScenario> }) => {
  const { t } = useTranslation()
  const { form, update, openQueues, providers } = start
  const target = form.target.kind === 'new' ? NEW : form.target.queueId

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
          <OptionList
            label={t('start.options')}
            shape="square"
            options={[
              form.target.kind === 'new'
                ? {
                    value: 'worktree',
                    label: t('start.worktree'),
                    description: t('start.worktreeHint'),
                  }
                : { value: 'afterSuccess', label: t('queue.afterSuccess') },
            ]}
            isSelected={(value) => (value === 'worktree' ? form.worktree : form.afterSuccess)}
            onSelect={(value) =>
              value === 'worktree'
                ? update({ worktree: !form.worktree })
                : update({ afterSuccess: !form.afterSuccess })
            }
          />
        </div>
      </Section>
      {providers.length > 1 && (
        <Section size="sm" title={t('newConversation.provider')}>
          <OptionList
            label={t('newConversation.provider')}
            options={providers.map((one) => ({ value: one.id, label: one.label }))}
            isSelected={(value) => value === start.provider}
            onSelect={(value) => update({ provider: value })}
          />
        </Section>
      )}
    </>
  )
}

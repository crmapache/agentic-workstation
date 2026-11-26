import { useTranslation } from 'react-i18next'

import { carryOnItemOf } from '@shared/scenario-queues'

import { Switch } from '@agentic-workstation/ui/Switch'

import type { LaunchPartProps } from '../LaunchModal.types'
import { ScenarioAlert } from '../../ScenarioAlert/ScenarioAlert'
import { queueNames } from '../../../../state/queue-folder.utils'

/**
 * Что решается вместе с «куда». Новая очередь - отдельный ли worktree: с ним незакоммиченное в нём
 * не окажется, без него в занятой папке проекта она ждёт своей очереди (ADR 0128) - или, по выбору
 * человека, начинает сразу рядом, и тогда обе правят одни файлы. О каждом сказано, только когда это
 * правда сейчас. Существующая очередь, что папку не держит, тоже подождёт - об этом строка.
 */
export const WhereOptions = ({ form }: LaunchPartProps) => {
  const { t } = useTranslation()
  const name = queueNames(form.waitsFor)
  const isWaiting = form.waitsFor.length > 0
  // Держатель стоит на недоделанном - сам он папку не отпустит: об этом и сказать.
  const stuck = form.waitsFor.find((queue) => carryOnItemOf(queue) !== null)
  const waits = stuck
    ? t('scenarios.launch.waitsUnfinished', { name: stuck.name })
    : form.target.kind === 'queue'
      ? t('scenarios.launch.queueWaitsTurn', { name })
      : t('scenarios.launch.waitsTurn', { name })

  if (form.target.kind === 'queue') {
    return isWaiting ? <ScenarioAlert>{waits}</ScenarioAlert> : null
  }

  return (
    <>
      <Switch
        label={t('scenarios.launch.worktree')}
        description={
          form.isNotGit ? t('scenarios.launch.notGit') : t('scenarios.launch.worktreeNote')
        }
        checked={form.worktree}
        disabled={form.isNotGit}
        onChange={form.setIsWorktree}
      />
      {form.worktree && form.uncommitted > 0 && (
        <ScenarioAlert>
          {t('scenarios.launch.uncommitted', { count: form.uncommitted })}
        </ScenarioAlert>
      )}
      {isWaiting && (
        <Switch
          label={t('scenarios.launch.alongside')}
          description={t('scenarios.launch.alongsideNote')}
          checked={form.alongside}
          onChange={form.setIsAlongside}
        />
      )}
      {isWaiting && (
        <ScenarioAlert>
          {form.alongside ? t('scenarios.launch.sharedFolder', { name }) : waits}
        </ScenarioAlert>
      )}
    </>
  )
}

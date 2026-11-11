import { useTranslation } from 'react-i18next'

import { Switch } from '@agentic-workstation/ui/Switch'

import type { LaunchPartProps } from '../LaunchModal.types'
import { LaunchNote } from './LaunchNote'

/**
 * Что решается вместе с «куда». Новая очередь - отдельный ли worktree: без него две очереди в
 * папке проекта правят одни файлы, с ним - незакоммиченное в нём не окажется; о том и другом
 * сказано, только когда это правда сейчас. Существующая - ждать ли успеха предыдущего
 * (включено: цепочка работ обычно стоит на самой себе).
 */
export const WhereOptions = ({ form }: LaunchPartProps) => {
  const { t } = useTranslation()

  if (form.target.kind === 'queue') {
    return (
      <Switch
        label={t('scenarios.launch.afterSuccess')}
        description={t('scenarios.launch.afterSuccessNote')}
        checked={form.afterSuccess}
        onChange={form.setAfterSuccess}
      />
    )
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
        <LaunchNote>{t('scenarios.launch.uncommitted', { count: form.uncommitted })}</LaunchNote>
      )}
      {form.neighbour && (
        <LaunchNote>{t('scenarios.launch.sharedFolder', { name: form.neighbour.name })}</LaunchNote>
      )}
    </>
  )
}

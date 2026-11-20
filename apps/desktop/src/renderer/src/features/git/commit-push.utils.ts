import type { TFunction } from 'i18next'

import type { CommitPushResult } from '@shared/commit-push'

import type { ActionNotice } from '../../state/action-notice.store'

/**
 * Итог Commit and push для угла окна: ушло - сообщение коммита и кто его написал; лёг, а push
 * отказал - коммит есть, и слова git; не вышло - на каком шаге и почему.
 */
export const commitPushNotice = (
  result: CommitPushResult,
  t: TFunction,
  providerLabel: (id: string) => string,
): ActionNotice => {
  switch (result.outcome) {
    case 'pushed':
      return {
        tone: 'success',
        title: t('git.commitPush.pushed'),
        details: `${result.message}\n\n${t('git.commitPush.by', { provider: providerLabel(result.by) })}`,
      }
    case 'committed':
      return {
        tone: 'danger',
        title: t('git.commitPush.pushFailed'),
        details: `${result.details}\n\n${t('git.commitPush.committedAs', { message: result.message.split('\n')[0] })}`,
      }
    case 'failed':
      return {
        tone: 'danger',
        title: t(`git.commitPush.failed.${result.stage}`),
        details: result.details,
      }
  }
}

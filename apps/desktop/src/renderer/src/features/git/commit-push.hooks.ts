import { useTranslation } from 'react-i18next'

import { useMutation, useIsMutating } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { useActionNoticeStore } from '../../state/action-notice.store'
import { useProviders } from '../../state/providers.queries'
import { QUERY_KEYS } from '../../state/query-keys'
import { commitPushNotice } from './commit-push.utils'
import { useGitRefresh } from './git.queries'

/**
 * Commit and push проекта: запуск, итог - в угол окна (в шапке его не видно), после - перечитать
 * ветку, статусы и счёт строк. Идёт - видят все, кто зовёт хук (ключ мутации на проект); второе
 * нажатие, пока идёт первое, ничего не начинает.
 */
export const useCommitPush = (projectId: string) => {
  const { t } = useTranslation()
  const show = useActionNoticeStore((state) => state.show)
  const providers = useProviders().data ?? []
  const refresh = useGitRefresh(projectId)
  const mutationKey = QUERY_KEYS.gitCommitPush(projectId)
  const isRunning = useIsMutating({ mutationKey }) > 0
  const commit = useMutation({
    mutationKey,
    mutationFn: () => invoke('git:commitAndPush', { projectId }),
    onSettled: refresh,
  })

  const providerLabel = (id: string) => providers.find((one) => one.id === id)?.label ?? id

  const run = async () => {
    if (isRunning) return

    try {
      show(commitPushNotice(await commit.mutateAsync(), t, providerLabel))
    } catch (error) {
      show({ tone: 'danger', title: t('git.commitPush.failed.commit'), details: String(error) })
    }
  }

  return { run, isRunning }
}

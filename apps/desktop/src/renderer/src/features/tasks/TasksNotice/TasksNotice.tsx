import { useTranslation } from 'react-i18next'

import { Toast } from '@agentic-workstation/ui/Toast'

import { useTasksStore } from '../tasks.store'

/**
 * Отказ действия заданий в углу окна: почему задание не сохранилось, прогон не поднялся или
 * разговор не открылся. Остаётся, пока его не закроют: это то, что человек должен прочесть.
 */
export const TasksNotice = () => {
  const { t } = useTranslation()
  const notice = useTasksStore((state) => state.notice)
  const dismiss = useTasksStore((state) => state.dismissNotice)

  if (!notice) return null

  return (
    <Toast
      tone="danger"
      title={t(`tasks.codes.${notice.code}`, { defaultValue: t('tasks.codes.unknown') })}
      close={{ label: t('common.close'), onClose: dismiss }}
    />
  )
}

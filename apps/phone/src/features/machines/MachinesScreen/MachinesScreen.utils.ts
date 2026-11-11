import type { PushStatus } from '../../../push/push-setup'

/** Строка раздела уведомлений по их состоянию; null - раздела нет (проверяем или релей без пушей). */
export type NotificationsLine = 'on' | 'off' | 'install' | 'denied' | 'unsupported'

export const notificationsLine = (status: PushStatus): NotificationsLine | null => {
  switch (status) {
    case 'checking':
    case 'unavailable':
      return null
    case 'working':
      return 'off'
    default:
      return status
  }
}

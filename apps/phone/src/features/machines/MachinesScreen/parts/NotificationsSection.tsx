import { BellOff, BellRing } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../MachinesScreen.module.scss'
import { notificationsLine } from '../MachinesScreen.utils'
import { usePush } from '../../../../lib/push'
import { usePushStore } from '../../../../state/push.store'
import { useToastStore } from '../../../../state/toast.store'

/**
 * Уведомления на телефоне: включить кнопкой (не сами - iPhone спрашивает разрешение только
 * по нажатию), выключить, и почему их нет (iPhone не с экрана «Домой», запрещены в настройках).
 * Релей пуши не шлёт - раздела нет: предложить нечего.
 */
export const NotificationsSection = () => {
  const { t } = useTranslation()
  const push = usePush()
  const status = usePushStore((state) => state.status)
  const showToast = useToastStore((state) => state.show)
  const line = notificationsLine(status)

  if (!line) return null

  const handleOn = async () => {
    if (await push.enable()) return
    if (usePushStore.getState().status !== 'denied') showToast(t('machines.notifications.failed'))
  }

  return (
    <Section
      title={t('machines.notifications.title')}
      description={t(`machines.notifications.${line}`)}
      help={
        <HelpButton
          size="touch"
          label={t('common.help')}
          title={t('machines.notifications.help.title')}
          text={t('machines.notifications.help.text')}
          closeLabel={t('common.close')}
        />
      }>
      {(status === 'off' || status === 'on' || status === 'working') && (
        <div className={styles.actions}>
          {status === 'on' ? (
            <Button size="touch" variant="ghost" icon={BellOff} onClick={() => void push.disable()}>
              {t('machines.notifications.turnOff')}
            </Button>
          ) : (
            <Button
              size="touch"
              variant="primary"
              icon={BellRing}
              disabled={status === 'working'}
              onClick={handleOn}>
              {t('machines.notifications.turnOn')}
            </Button>
          )}
        </div>
      )}
    </Section>
  )
}

import { Smartphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { useRemote } from '../remote.queries'
import { useRemoteStore } from '../remote.store'
import styles from './RemoteButton.module.scss'

/**
 * Remote Control в строке состояния: значок телефона и число телефонов на связи; телефон ждёт
 * Approve - кнопка тонирована акцентом. Нажатие открывает окно Remote Control.
 */
export const RemoteButton = () => {
  const { t } = useTranslation()
  const { data: view } = useRemote()
  const open = useRemoteStore((state) => state.open)
  const online = view?.devices.filter((device) => device.online).length ?? 0
  const label = !view?.enabled
    ? t('remote.button.off')
    : view.pending
      ? t('remote.button.pending', { label: view.pending.label })
      : t('remote.button.on', { count: online })

  return (
    <Tooltip label={label} placement="top">
      <Button
        variant={view?.pending ? 'primary' : 'ghost'}
        size="sm"
        icon={Smartphone}
        aria-label={label}
        onClick={open}>
        {view?.enabled && <span className={styles.count}>{online}</span>}
      </Button>
    </Tooltip>
  )
}

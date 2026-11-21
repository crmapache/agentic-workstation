import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useTrackerStore } from '../tracker.store'
import { useCloudState } from '../../../state/tracker.queries'
import { cloudIcon } from './CloudModal.utils'

/**
 * Значок облака в шапке трекера: состояние синхронизации видно сразу, нажатие - окно облака.
 * Пока ключ аккаунта не сохранён, значок зовёт светом: без ключа доски не вернуть.
 */
export const CloudButton = () => {
  const { t } = useTranslation()
  const { data: cloud } = useCloudState()
  const open = useTrackerStore((state) => state.open)

  if (!cloud) return null

  return (
    <IconButton
      icon={cloudIcon(cloud.status)}
      label={t('tracker.cloud.button', { status: t(`tracker.cloud.status.${cloud.status}`) })}
      call={!cloud.keySaved && cloud.status !== 'off' ? 'attention' : null}
      onClick={() => open('cloud')}
    />
  )
}

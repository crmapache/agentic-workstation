import { Palette } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import type { DesignSignInProps } from '../AccountsScreen.types'
import { usePutPanelState } from '../../panel-state.hooks'
import { invoke } from '../../../../lib/ipc'

/**
 * Вход в Claude Design для аккаунта в работе (как в ACC): только Терминал умеет его сделать,
 * кнопка верна и для машины с одним входом. Почему так - в «?» экрана.
 */
export const DesignSignIn = ({ busy }: DesignSignInProps) => {
  const { t } = useTranslation()
  const put = usePutPanelState('claude')

  const handleDesign = () =>
    void put(invoke('claudePanel:terminalCommand', { command: 'design-login' }))

  return (
    <Button icon={Palette} disabled={busy} onClick={handleDesign}>
      {t('agentPanel.accounts.designAuthorize')}
    </Button>
  )
}

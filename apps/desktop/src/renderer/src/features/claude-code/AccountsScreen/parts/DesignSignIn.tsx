import { Palette } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ClaudeState } from '@shared/claude'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@agentic-workstation/ui/Button'

import type { DesignSignInProps } from '../AccountsScreen.types'
import { invoke } from '../../../../lib/ipc'
import { QUERY_KEYS } from '../../../../state/query-keys'

/**
 * Вход в Claude Design для аккаунта в работе (как в ACC): только Терминал умеет его сделать,
 * кнопка верна и для машины с одним входом. Почему так - в «?» экрана.
 */
export const DesignSignIn = ({ busy }: DesignSignInProps) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const handleDesign = () => {
    invoke('claudePanel:terminalCommand', { command: 'design-login' })
      .then((state) => queryClient.setQueryData<ClaudeState>(QUERY_KEYS.claudeState, state))
      .catch((error: unknown) => console.warn('[claude-code] вход в Design не открылся:', error))
  }

  return (
    <Button icon={Palette} disabled={busy} onClick={handleDesign}>
      {t('claudeCode.accounts.designAuthorize')}
    </Button>
  )
}

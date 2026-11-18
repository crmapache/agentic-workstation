import { useEffect, useCallback } from 'react'

import type { ClaudeState } from '@shared/claude'
import { useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../../lib/ipc'
import { QUERY_KEYS } from '../../../state/query-keys'
import { SIGN_IN_RECHECK_MS } from './LoginGate.constants'

/**
 * Проверка входа аккаунта в работе: по «Check again» и сама, пока экран входа открыт, -
 * человек мог войти в обычном терминале, мимо кнопки панели.
 */
export const useSignInCheck = () => {
  const queryClient = useQueryClient()

  const check = useCallback(() => {
    invoke('claudePanel:checkSignIn')
      .then((state) =>
        queryClient.setQueryData<ClaudeState>(QUERY_KEYS.agentState('claude'), state),
      )
      .catch((error: unknown) => console.warn('[claude-code] вход не проверился:', error))
  }, [queryClient])

  useEffect(() => {
    const timer = window.setInterval(check, SIGN_IN_RECHECK_MS)

    return () => window.clearInterval(timer)
  }, [check])

  return check
}

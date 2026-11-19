import { useEffect, useCallback } from 'react'

import { usePanelAccounts } from '../panel-accounts.hooks'
import { SIGN_IN_RECHECK_MS } from './LoginGate.constants'

/**
 * Проверка входа аккаунта в работе: по «Check again» и сама, пока экран входа открыт, -
 * человек мог войти в обычном терминале, мимо кнопки панели.
 */
export const useSignInCheck = () => {
  const { check: ask } = usePanelAccounts()

  const check = useCallback(() => void ask(), [ask])

  useEffect(() => {
    const timer = window.setInterval(check, SIGN_IN_RECHECK_MS)

    return () => window.clearInterval(timer)
  }, [check])

  return check
}

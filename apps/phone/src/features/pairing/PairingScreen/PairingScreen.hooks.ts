import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useClient } from '../../../lib/client'
import { navigateFromHere } from '../../../lib/router.store'
import type { PairingOffer } from '../../../remote/pairing'
import { usePairingStore } from '../../../state/pairing.store'
import type { PairingPhase } from './PairingScreen.types'
import { deviceKindOf } from './PairingScreen.utils'

/**
 * Пара по коду из QR: ключи телефона создаются сразу (их отпечаток человек сверяет с IDE), по
 * «Pair» уходит доказательство, дальше - ожидание Approve. Удалась - код забыт, экран IDE.
 */
export const usePairing = () => {
  const { t } = useTranslation()
  const client = useClient()
  const taken = usePairingStore((state) => state.taken)
  const clearCode = usePairingStore((state) => state.clear)
  const [offer, setOffer] = useState<PairingOffer | null>(null)
  const [phase, setPhase] = useState<PairingPhase>({ kind: 'preparing' })
  const [label, setLabel] = useState(
    () => client.savedLabel || t(`pairing.deviceNames.${deviceKindOf(window.navigator.userAgent)}`),
  )
  const code = taken.kind === 'code' ? taken.code : null

  useEffect(() => {
    if (!code) return

    let alive = true

    void client.preparePairing(code).then((prepared) => {
      if (!alive) return

      setOffer(prepared)
      setPhase({ kind: 'ready' })
    })

    return () => {
      alive = false
      client.cancelPairing()
    }
  }, [client, code])

  const pair = async () => {
    if (!offer) return

    setPhase({ kind: 'waiting' })

    const navigate = navigateFromHere()
    const outcome = await client.pair(offer, label)

    if (!outcome.ok) return setPhase({ kind: 'failed', reason: outcome.reason })

    clearCode()
    navigate({ name: 'machines' }, { replace: true })
  }

  const cancel = () => client.cancelPairing()

  return { taken, offer, phase, label, setLabel, pair, cancel }
}

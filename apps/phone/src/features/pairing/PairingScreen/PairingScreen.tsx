import { QrCode, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { useRouter } from '../../../lib/router.store'
import { Screen } from '../../../shell/Screen/Screen'
import { usePairing } from './PairingScreen.hooks'
import { PairingFooter } from './parts/PairingFooter'
import { PairingKeys } from './parts/PairingKeys'

/**
 * Пара телефона с IDE по QR из окна Remote Control. Код приходит фрагментом адреса и стёрт из
 * него ещё до первого кадра (lib/pairing-link.ts). Отпечаток IDE из кода телефон сверяет сам,
 * а человек сверяет отпечаток телефона на экране IDE, прежде чем нажать Approve.
 */
export const PairingScreen = () => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)
  const pairing = usePairing()
  const { taken } = pairing
  const help = { title: t('pairing.help.title'), text: t('pairing.help.text') }
  const handleHome = () => navigate({ name: 'machines' }, { replace: true })

  if (taken.kind !== 'code') {
    const invalid = taken.kind === 'invalid'

    return (
      <Screen title={t('pairing.title')} help={help}>
        <EmptyState
          icon={invalid ? ShieldAlert : QrCode}
          title={t(invalid ? 'pairing.invalid.title' : 'pairing.noCode.title')}
          description={t(invalid ? 'pairing.invalid.description' : 'pairing.noCode.description')}
          action={
            <Button size="touch" onClick={handleHome}>
              {t('pairing.toMachines')}
            </Button>
          }
        />
      </Screen>
    )
  }

  return (
    <Screen title={t('pairing.title')} help={help} footer={<PairingFooter pairing={pairing} />}>
      <PairingKeys pairing={pairing} code={taken.code} />
    </Screen>
  )
}

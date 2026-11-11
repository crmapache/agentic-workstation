import { useTranslation } from 'react-i18next'

import type { PairingCode } from '@agentic-workstation/remote-protocol/pairing-url'
import { Section } from '@agentic-workstation/ui/Section'
import { Spinner } from '@agentic-workstation/ui/Spinner'
import { TextField } from '@agentic-workstation/ui/TextField'

import type { usePairing } from '../PairingScreen.hooks'
import { LABEL_MAX } from '../../../../remote/pairing'
import { Fingerprint } from '../../../../shell/Fingerprint/Fingerprint'

/** Два отпечатка для сверки глазами и имя телефона в списке IDE. */
export const PairingKeys = ({
  pairing,
  code,
}: {
  pairing: ReturnType<typeof usePairing>
  code: PairingCode
}) => {
  const { t } = useTranslation()
  const { offer, phase, label, setLabel } = pairing

  return (
    <>
      <Section size="sm" title={t('pairing.ideKey')} description={t('pairing.ideKeyHint')}>
        <Fingerprint value={code.fingerprint} label={t('pairing.ideKey')} />
      </Section>
      <Section size="sm" title={t('pairing.phoneKey')} description={t('pairing.phoneKeyHint')}>
        {offer ? (
          <Fingerprint value={offer.phoneFingerprint} label={t('pairing.phoneKey')} />
        ) : (
          <Spinner size="md" label={t('pairing.preparing')} />
        )}
      </Section>
      <TextField
        size="touch"
        label={t('pairing.phoneName')}
        value={label}
        maxLength={LABEL_MAX}
        disabled={phase.kind === 'waiting'}
        onChange={setLabel}
      />
    </>
  )
}

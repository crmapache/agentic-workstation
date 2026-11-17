import { useTranslation } from 'react-i18next'

import { QrCamera } from '../QrCamera/QrCamera'
import { codeFromLink } from '../../../lib/pairing-link'
import { usePairingStore } from '../../../state/pairing.store'
import { Screen } from '../../../shell/Screen/Screen'
import { usePairing } from './PairingScreen.hooks'
import { PairingFooter } from './parts/PairingFooter'
import { PairingKeys } from './parts/PairingKeys'

/**
 * Пара телефона с IDE по QR из окна Remote Control. Без кода на экране только камера: она сама
 * читает QR (lib/pairing-link.ts, codeFromLink). Код приходит и фрагментом открытого адреса -
 * QR, снятый камерой системы, - и стёрт из него ещё до первого кадра. Отпечаток IDE из кода
 * телефон сверяет сам, а человек сверяет отпечаток телефона на экране IDE, прежде чем нажать Approve.
 */
export const PairingScreen = () => {
  const { t } = useTranslation()
  const take = usePairingStore((state) => state.take)
  const pairing = usePairing()
  const { taken } = pairing
  const help = { title: t('pairing.help.title'), text: t('pairing.help.text') }
  const handleText = (text: string) => take(codeFromLink(text, window.location.origin))

  if (taken.kind !== 'code') {
    return (
      <Screen title={t('pairing.title')} help={help}>
        <QrCamera
          onText={handleText}
          notice={taken.kind === 'invalid' ? t('pairing.invalid') : null}
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

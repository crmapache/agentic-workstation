import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { COUNTDOWN_MS } from '../RemoteModal.constants'
import { useNow } from '../RemoteModal.hooks'
import styles from '../RemoteModal.module.scss'
import type { PairingOfferProps } from '../RemoteModal.types'
import { countdown, qrDataUrl } from '../RemoteModal.utils'
import { useRemoteActions } from '../../remote.queries'

/** Код пары: одноразовый, три минуты; секрет - в части адреса после #, релею её не шлют. */
export const PairingOffer = ({ pairing }: PairingOfferProps) => {
  const { t } = useTranslation()
  const { refuse } = useRemoteActions()
  const now = useNow(COUNTDOWN_MS)
  const image = useMemo(() => qrDataUrl(pairing.url), [pairing.url])

  return (
    <div className={styles.offer}>
      <img className={styles.qr} src={image} alt={t('remote.pair.qrLabel')} />
      <div className={styles.offerSide}>
        <p className={styles.hint}>{t('remote.pair.scan')}</p>
        <span className={styles.countdown}>{countdown(pairing.expiresAt, now)}</span>
        <Button variant="secondary" size="sm" onClick={refuse}>
          {t('remote.pair.stop')}
        </Button>
      </div>
    </div>
  )
}

import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import type { usePairing } from '../PairingScreen.hooks'
import styles from '../PairingScreen.module.scss'
import { canRetry } from '../PairingScreen.utils'

/** Низ экрана пары: кнопка, ожидание Approve или почему не вышло. */
export const PairingFooter = ({ pairing }: { pairing: ReturnType<typeof usePairing> }) => {
  const { t } = useTranslation()
  const { phase, label, pair, cancel } = pairing

  if (phase.kind === 'waiting') {
    return (
      <div className={styles.footer}>
        <p className={styles.state}>
          <Spinner size="md" tone="accent" />
          {t('pairing.waiting')}
        </p>
        <Button size="touch" variant="ghost" onClick={cancel}>
          {t('common.cancel')}
        </Button>
      </div>
    )
  }

  const failed = phase.kind === 'failed'
  const blocked = failed && !canRetry(phase.reason)

  return (
    <div className={styles.footer}>
      {failed && <p className={styles.error}>{t(`pairing.failed.${phase.reason}`)}</p>}
      <Button
        size="touch"
        variant="primary"
        disabled={phase.kind === 'preparing' || blocked || !label.trim()}
        onClick={() => void pair()}>
        {t('pairing.pair')}
      </Button>
    </div>
  )
}

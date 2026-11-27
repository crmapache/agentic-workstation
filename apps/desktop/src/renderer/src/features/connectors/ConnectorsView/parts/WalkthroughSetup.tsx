import { useTranslation } from 'react-i18next'

import { walkthroughMissing } from '@shared/walkthrough'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Section } from '@agentic-workstation/ui/Section'

import { WALKTHROUGH_NEEDS_SHOWN } from '../ConnectorsView.constants'
import styles from '../ConnectorsView.module.scss'
import { useConnectors } from '../../../../state/connectors.queries'
import { useVoice } from '../../../../state/voice.queries'
import { ConnectorsHelp } from './ConnectorsHelp'

/**
 * Walkthrough в окне коннектора (ADR 0134): без чего показа нет - Computer Use, Browser Use и
 * голос (ключ Deepgram), строками с состоянием, как разрешения Computer Use. Как начать показ и
 * как он идёт - в «?».
 */
export const WalkthroughSetup = () => {
  const { t } = useTranslation()
  const connectors = useConnectors().data?.connectors ?? []
  const voice = useVoice()
  const missing = walkthroughMissing(connectors, null)
  const isReady = (need: (typeof WALKTHROUGH_NEEDS_SHOWN)[number]) =>
    need === 'voice' ? voice?.capability.available === true : !missing.includes(need)

  return (
    <Section
      size="sm"
      title={t('connectors.walkthrough.title')}
      help={<ConnectorsHelp topic="walkthrough" />}>
      <div className={styles.toolList}>
        {WALKTHROUGH_NEEDS_SHOWN.map((need) => (
          <div key={need} className={styles.permissionRow}>
            <div className={styles.permissionText}>
              <span className={styles.factValue}>{t(`connectors.walkthrough.${need}.name`)}</span>
              <span className={styles.factLabel}>{t(`connectors.walkthrough.${need}.why`)}</span>
            </div>
            {isReady(need) ? (
              <Badge tone="success">{t('connectors.walkthrough.ready')}</Badge>
            ) : (
              <Badge tone="warning">{t('connectors.walkthrough.missing')}</Badge>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

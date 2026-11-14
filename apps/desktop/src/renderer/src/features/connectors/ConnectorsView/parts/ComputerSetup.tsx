import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { Section } from '@agentic-workstation/ui/Section'

import { COMPUTER_PERMISSIONS } from '../ConnectorsView.constants'
import styles from '../ConnectorsView.module.scss'
import type { ComputerSetupProps } from '../ConnectorsView.types'
import { useConnectorActions } from '../../../../state/connectors.queries'
import { ConnectorsHelp } from './ConnectorsHelp'

/**
 * Computer Use в окне коннектора (ADR 0057, 0058). Мак: два разрешения строками - что и зачем,
 * выдано ли, кнопка «Allow» открывает настройку; выдача видна сама - главный процесс перечитывает
 * разрешения, когда человек возвращается в IDE. Windows разрешений не спрашивает: там пояснение,
 * чего ИИ не сможет (приложения от имени администратора).
 */
export const ComputerSetup = ({ computer }: ComputerSetupProps) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()

  if (!computer.needsPermissions) {
    return (
      <Section
        size="sm"
        title={t('connectors.computer.windowsTitle')}
        help={<ConnectorsHelp topic="computer" />}>
        <p className={styles.hint}>
          {computer.supported
            ? t('connectors.computer.windows')
            : t('connectors.computer.unsupported')}
        </p>
      </Section>
    )
  }

  return (
    <Section
      size="sm"
      title={t('connectors.computer.title')}
      help={<ConnectorsHelp topic="computer" />}>
      {computer.supported ? (
        <div className={styles.stack}>
          <div className={styles.toolList}>
            {COMPUTER_PERMISSIONS.map((permission) => (
              <div key={permission} className={styles.permissionRow}>
                <div className={styles.permissionText}>
                  <span className={styles.factValue}>
                    {t(`connectors.computer.${permission}.name`)}
                  </span>
                  <span className={styles.factLabel}>
                    {t(`connectors.computer.${permission}.why`)}
                  </span>
                </div>
                {computer[permission] ? (
                  <Badge tone="success">{t('connectors.computer.allowed')}</Badge>
                ) : (
                  <Button
                    size="sm"
                    icon={ShieldCheck}
                    onClick={() => void actions.allowComputer(permission)}>
                    {t('connectors.computer.allow')}
                  </Button>
                )}
              </div>
            ))}
          </div>
          {!computer.screen && <p className={styles.hint}>{t('connectors.computer.reopen')}</p>}
        </div>
      ) : (
        <p className={styles.hint}>{t('connectors.computer.unsupported')}</p>
      )}
    </Section>
  )
}

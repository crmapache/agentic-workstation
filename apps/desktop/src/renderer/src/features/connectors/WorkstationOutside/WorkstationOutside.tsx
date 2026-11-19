import { Copy, Check, KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { OUTSIDE_COPIES } from '@shared/connectors'
import type { OutsideCopy } from '@shared/connectors'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { Section } from '@agentic-workstation/ui/Section'
import { Switch } from '@agentic-workstation/ui/Switch'

import { ConnectorsHelp } from '../ConnectorsView/parts/ConnectorsHelp'
import { useConnectorActions } from '../../../state/connectors.queries'
import { OUTSIDE_TONES } from './WorkstationOutside.constants'
import { useOutsideCopy } from './WorkstationOutside.hooks'
import styles from './WorkstationOutside.module.scss'
import type { WorkstationOutsideProps } from './WorkstationOutside.types'

/**
 * Вход в IDE снаружи в окне коннектора Agentic Workstation (ADR 0090): переключатель, состояние
 * сервера с адресом, настройка для Claude Code, Codex, Antigravity CLI, Kimi Code или любого клиента
 * MCP - в буфер вместе с ключом, и новый ключ. Ключ окно не видит: текст кладёт в буфер главный
 * процесс.
 */
export const WorkstationOutside = ({ outside }: WorkstationOutsideProps) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const popover = usePopover()
  const outsideCopy = useOutsideCopy()
  const isWorking = outside.enabled && outside.status === 'on'

  const handleToggle = (enabled: boolean) => void actions.setOutside(enabled)

  const handleRenew = () => void actions.renewOutsideKey()

  const handleCopy = (what: OutsideCopy) => {
    popover.close()
    void outsideCopy.copy(what)
  }

  return (
    <Section
      size="sm"
      title={t('connectors.outside.title')}
      help={<ConnectorsHelp topic="outside" />}>
      <div className={styles.stack}>
        <Switch
          label={t('connectors.outside.switch')}
          description={t('connectors.outside.switchHint')}
          checked={outside.enabled}
          disabled={!outside.vault}
          onChange={handleToggle}
        />
        {!outside.vault && <p className={styles.failure}>{t('connectors.outside.noVault')}</p>}
        {outside.enabled && (
          <div className={styles.status}>
            <Badge tone={OUTSIDE_TONES[outside.status]}>
              {t(`connectors.outside.status.${outside.status}`)}
            </Badge>
            <span className={styles.address}>{outside.url}</span>
          </div>
        )}
        {(outside.status === 'port-busy' || outside.status === 'failed') && (
          <p className={styles.failure}>{t(`connectors.outside.why.${outside.status}`)}</p>
        )}
        {isWorking && (
          <div className={styles.actions}>
            <Button
              {...popover.triggerProps}
              size="sm"
              icon={outsideCopy.copied ? Check : Copy}
              menu>
              {t(outsideCopy.copied ? 'connectors.outside.copied' : 'connectors.outside.copy')}
            </Button>
            <Popover {...popover.popoverProps}>
              {popover.isOpen && (
                <Menu label={t('connectors.outside.copy')} autoFocus>
                  {OUTSIDE_COPIES.map((what) => (
                    <MenuItem
                      key={what}
                      icon={Copy}
                      label={t(`connectors.outside.copyFor.${what}`)}
                      onSelect={() => handleCopy(what)}
                    />
                  ))}
                </Menu>
              )}
            </Popover>
            <Button size="sm" variant="ghost" icon={KeyRound} onClick={handleRenew}>
              {t('connectors.outside.renew')}
            </Button>
          </div>
        )}
        {outsideCopy.failed && <p className={styles.failure}>{t('connectors.outside.noVault')}</p>}
      </div>
    </Section>
  )
}

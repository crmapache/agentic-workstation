import { useState } from 'react'
import { Trash2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../MachinesScreen.module.scss'
import { useClient } from '../../../../lib/client'
import { useInventory, useLinkStatus } from '../../../../state/remote.queries'
import type { MachineView } from '../../../../state/remote.types'
import { LinkBadge } from '../../../../shell/LinkBadge/LinkBadge'
import { ForgetDialog } from './ForgetDialog'
import { MachineProjects } from './MachineProjects'

/** Одна IDE: имя, связь, переподключить, забыть; под ней - её проекты. */
export const MachineSection = ({ machine }: { machine: MachineView }) => {
  const { t } = useTranslation()
  const client = useClient()
  const status = useLinkStatus(machine.agentId)
  const inventory = useInventory(machine.agentId).data
  const [isForgetting, setIsForgetting] = useState(false)
  const version = inventory ? t('machines.version', { version: inventory.machine.ideVersion }) : ''

  return (
    <Section
      title={inventory?.machine.label ?? machine.label}
      description={version || undefined}
      actions={
        <>
          <LinkBadge status={machine.revoked ? 'revoked' : status} />
          {!machine.revoked && status !== 'online' && (
            <IconButton
              icon={RefreshCw}
              size="touch"
              label={t('machines.reconnect')}
              onClick={() => client.reconnect(machine.agentId)}
            />
          )}
          <IconButton
            icon={Trash2}
            size="touch"
            label={t('machines.forget')}
            onClick={() => setIsForgetting(true)}
          />
        </>
      }>
      <div className={styles.machine}>
        {machine.revoked ? (
          <p className={styles.meta}>{t('machines.revoked')}</p>
        ) : (
          <MachineProjects agentId={machine.agentId} inventory={inventory} />
        )}
      </div>
      <ForgetDialog open={isForgetting} machine={machine} onClose={() => setIsForgetting(false)} />
    </Section>
  )
}

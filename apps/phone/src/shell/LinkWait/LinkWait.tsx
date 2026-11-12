import { Unlink, CloudOff, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { useClient } from '../../lib/client'
import { useRouter } from '../../lib/router.store'
import { useLinkStatus } from '../../state/remote.queries'

/**
 * Вместо данных IDE, которых ещё нет: пока звоним - знак работы, IDE не отвечает - пусто с
 * «переподключить», отпустила - пусто с дорогой к списку IDE. Вечный знак работы при
 * недоступной IDE читался бы как «вот-вот придёт».
 */
export const LinkWait = ({ agentId, label }: { agentId: string; label: string }) => {
  const { t } = useTranslation()
  const client = useClient()
  const navigate = useRouter((state) => state.navigate)
  const status = useLinkStatus(agentId)

  if (status === 'offline') {
    return (
      <EmptyState
        icon={CloudOff}
        title={t('link.wait.offlineTitle')}
        description={t('link.wait.offlineText')}
        action={
          <Button
            size="touch"
            variant="primary"
            icon={RefreshCw}
            onClick={() => client.reconnect(agentId)}>
            {t('machines.reconnect')}
          </Button>
        }
      />
    )
  }

  if (status === 'revoked') {
    return (
      <EmptyState
        icon={Unlink}
        title={t('link.wait.revokedTitle')}
        description={t('machines.revoked')}
        action={
          <Button size="touch" onClick={() => navigate({ name: 'machines' })}>
            {t('pairing.toMachines')}
          </Button>
        }
      />
    )
  }

  return <Spinner size="md" label={label} />
}

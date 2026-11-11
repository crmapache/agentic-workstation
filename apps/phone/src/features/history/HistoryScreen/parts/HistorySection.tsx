import { useTranslation } from 'react-i18next'

import type { ProviderCaps } from '@agentic-workstation/remote-protocol/wire-types'
import type { OpenedConversationWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { Section } from '@agentic-workstation/ui/Section'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import styles from '../HistoryScreen.module.scss'
import { useNow } from '../../../../lib/now.hooks'
import type { RouteOf } from '../../../../lib/route.types'
import { useRouter } from '../../../../lib/router.store'
import { sinceText } from '../../../../lib/time.utils'
import { useCommand } from '../../../../state/commands.hooks'
import { failureText } from '../../../../state/commands.utils'
import { useHistory } from '../../../../state/remote.queries'
import type { MirroredInventory } from '../../../../state/remote.types'
import { ListGroup } from '../../../../shell/ListGroup/ListGroup'
import { ListRow } from '../../../../shell/ListRow/ListRow'
import { PathText } from '../../../../shell/PathText/PathText'

/**
 * Прошлые разговоры одного провайдера: свежие сверху, когда менялись, открыт ли уже вкладкой.
 * Нажатие открывает разговор в IDE (или берёт открытую вкладку) и ведёт в него; у закрытого
 * проекта строки только читаются - открыть разговор можно, только открыв проект.
 */
export const HistorySection = ({
  route,
  provider,
  inventory,
  canOpen,
}: {
  route: RouteOf<'history'>
  provider: ProviderCaps
  inventory: MirroredInventory
  canOpen: boolean
}) => {
  const { t } = useTranslation()
  const { agentId, projectKey } = route
  const navigate = useRouter((state) => state.navigate)
  const history = useHistory(agentId, projectKey, provider.id)
  const open = useCommand(agentId, 'conversation.openHistory')
  const now = useNow(60_000)
  const offset = inventory.at - inventory.receivedAt
  const entries = history.data?.entries ?? []

  const handleOpen = async (sessionId: string) => {
    if (open.isPending) return

    const data = (await open
      .mutateAsync({ projectKey, provider: provider.id, sessionId })
      .catch(() => null)) as OpenedConversationWire | null

    if (data?.conversationId) {
      navigate({ name: 'conversation', agentId, projectKey, conversationId: data.conversationId })
    }
  }

  return (
    <Section
      size="sm"
      title={provider.label}
      count={history.data ? entries.length : undefined}
      description={history.data && entries.length === 0 ? t('history.empty') : undefined}>
      {history.isPending && <Spinner size="md" label={t('history.loading')} />}
      {history.isError && (
        <div className={styles.failed}>
          <p className={styles.error}>{failureText(t, history.error)}</p>
          <Button size="touch" onClick={() => void history.refetch()}>
            {t('history.retry')}
          </Button>
        </div>
      )}
      {entries.length > 0 && (
        <ListGroup label={provider.label}>
          {entries.map((entry) => (
            <ListRow
              key={entry.sessionId}
              title={entry.title ? <PathText text={entry.title} /> : t('history.untitled')}
              description={sinceText(t, entry.updatedAt, now, offset)}
              trailing={entry.isOpen && <Badge tone="success">{t('history.open')}</Badge>}
              onClick={canOpen ? () => void handleOpen(entry.sessionId) : undefined}
            />
          ))}
        </ListGroup>
      )}
      {history.data?.more && <p className={styles.note}>{t('history.more')}</p>}
    </Section>
  )
}

import { useTranslation } from 'react-i18next'

import type { InventoryProject } from '@agentic-workstation/remote-protocol/wire-types'
import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../ProjectScreen.module.scss'
import { groupByProvider } from '../ProjectScreen.utils'
import { useNow } from '../../../../lib/now.hooks'
import { useRouter } from '../../../../lib/router.store'
import { conversationBadge } from '../../../../lib/status.constants'
import { sinceText } from '../../../../lib/time.utils'
import type { MirroredInventory } from '../../../../state/remote.types'
import { ListGroup } from '../../../../shell/ListGroup/ListGroup'
import { ListRow } from '../../../../shell/ListRow/ListRow'

/** Разговоры проекта по провайдерам: у каждого - состояние и с какого времени. */
export const ConversationGroups = ({
  agentId,
  inventory,
  project,
}: {
  agentId: string
  inventory: MirroredInventory
  project: InventoryProject
}) => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)
  const now = useNow(15_000)
  const offset = inventory.at - inventory.receivedAt
  const groups = groupByProvider(project.conversations, inventory.providers)

  if (groups.length === 0) {
    return (
      <Section
        size="sm"
        title={t('project.conversations')}
        description={t('project.noConversations')}>
        <Button
          size="touch"
          variant="dashed"
          onClick={() => navigate({ name: 'newConversation', agentId, projectKey: project.key })}>
          {t('project.newConversation')}
        </Button>
      </Section>
    )
  }

  return (
    <div className={styles.groups}>
      {groups.map((group) => (
        <Section key={group.provider} size="sm" title={group.label} count={group.items.length}>
          <ListGroup label={group.label}>
            {group.items.map((conversation) => (
              <ListRow
                key={conversation.id}
                title={conversation.title}
                description={[
                  conversation.waiting && t(`project.waiting.${conversation.waiting}`),
                  sinceText(t, conversation.since, now, offset),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  <Badge tone={conversationBadge(conversation).tone}>
                    {t(conversationBadge(conversation).key)}
                  </Badge>
                }
                onClick={() =>
                  navigate({
                    name: 'conversation',
                    agentId,
                    projectKey: project.key,
                    conversationId: conversation.id,
                  })
                }
              />
            ))}
          </ListGroup>
        </Section>
      ))}
    </div>
  )
}

import { useTranslation } from 'react-i18next'

import type { InventoryProject } from '@agentic-workstation/remote-protocol/wire-types'
import { Badge } from '@agentic-workstation/ui/Badge'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../ProjectScreen.module.scss'
import { groupByProvider } from '../ProjectScreen.utils'
import { useRouter } from '../../../../lib/router.store'
import { conversationBadge } from '../../../../lib/status.constants'
import type { MirroredInventory } from '../../../../state/remote.types'
import { ListGroup } from '../../../../shell/ListGroup/ListGroup'
import { ListRow } from '../../../../shell/ListRow/ListRow'
import { PathText } from '../../../../shell/PathText/PathText'

/**
 * Разговоры проекта по провайдерам: у каждого - состояние и, если ждёт человека, чего ждёт.
 * Времени нет: «с какого момента в этом состоянии» читалось как длительность работы и только
 * путало (просьба владельца).
 */
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
  const groups = groupByProvider(project.conversations, inventory.providers)

  // Новый разговор - кнопкой в низу экрана; здесь только честное «пока нет».
  if (groups.length === 0) {
    return (
      <Section
        size="sm"
        title={t('project.conversations')}
        description={t('project.noConversations')}>
        {null}
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
                title={<PathText text={conversation.title} />}
                description={
                  conversation.waiting ? t(`project.waiting.${conversation.waiting}`) : undefined
                }
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

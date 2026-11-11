import { useTranslation } from 'react-i18next'

import { Avatar } from '@agentic-workstation/ui/Avatar'
import { Badge } from '@agentic-workstation/ui/Badge'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import styles from '../MachinesScreen.module.scss'
import {
  initialsOf,
  avatarToneOf,
  projectNeedsYou,
  conversationCounts,
} from '../../../../lib/projects.utils'
import { useRouter } from '../../../../lib/router.store'
import type { MirroredInventory } from '../../../../state/remote.types'
import { ListGroup } from '../../../../shell/ListGroup/ListGroup'
import { ListRow } from '../../../../shell/ListRow/ListRow'

/** Открытые проекты IDE, под ними - недавние (у них видны только очереди сценариев). */
export const MachineProjects = ({
  agentId,
  inventory,
}: {
  agentId: string
  inventory: MirroredInventory | undefined
}) => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)

  if (!inventory) return <Spinner size="md" label={t('machines.loading')} />

  const open = inventory.projects.filter((project) => project.open)
  const recent = inventory.projects.filter((project) => !project.open)

  const rowsOf = (projects: typeof open) =>
    projects.map((project) => {
      const counts = conversationCounts(project)
      const parts = [
        counts.running > 0 && t('machines.counts.running', { count: counts.running }),
        counts['waiting-for-you'] > 0 &&
          t('machines.counts.waiting', { count: counts['waiting-for-you'] }),
        project.open && t('machines.counts.conversations', { count: project.conversations.length }),
        project.queues.open > 0 && t('machines.counts.queues', { count: project.queues.open }),
      ].filter(Boolean)

      return (
        <ListRow
          key={project.key}
          title={project.name}
          description={parts.join(' · ')}
          muted={!project.open}
          leading={<Avatar initials={initialsOf(project.name)} tone={avatarToneOf(project.name)} />}
          trailing={
            projectNeedsYou(project) && (
              <Badge tone="accent" variant="soft">
                {t('machines.needsYou')}
              </Badge>
            )
          }
          onClick={() => navigate({ name: 'project', agentId, projectKey: project.key })}
        />
      )
    })

  return (
    <>
      {open.length === 0 ? (
        <p className={styles.meta}>{t('machines.noOpenProjects')}</p>
      ) : (
        <ListGroup label={t('machines.openProjects')}>{rowsOf(open)}</ListGroup>
      )}
      {recent.length > 0 && (
        <>
          <h4 className={styles.recentTitle}>{t('machines.recent')}</h4>
          <ListGroup label={t('machines.recent')}>{rowsOf(recent)}</ListGroup>
        </>
      )}
    </>
  )
}

import { LayoutGrid } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'

import styles from '../MachinesScreen.module.scss'
import { useRouter } from '../../../../lib/router.store'
import type { MirroredInventory } from '../../../../state/remote.types'
import { ListGroup } from '../../../../shell/ListGroup/ListGroup'
import { ListRow } from '../../../../shell/ListRow/ListRow'

/** Строка доски всех очередей машины: сколько открыто, ждут ли человека; ведёт на доску. */
export const BoardRow = ({
  agentId,
  inventory,
}: {
  agentId: string
  inventory: MirroredInventory
}) => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)
  const open = inventory.projects.reduce((sum, project) => sum + project.queues.open, 0)
  const asking = inventory.projects.reduce((sum, project) => sum + project.queues.asking, 0)

  return (
    <ListGroup label={t('board.title')}>
      <ListRow
        title={t('board.title')}
        description={open > 0 ? t('machines.counts.queues', { count: open }) : t('board.none')}
        leading={<LayoutGrid className={styles.rowIcon} aria-hidden />}
        trailing={
          asking > 0 && (
            <Badge tone="accent" variant="soft">
              {t('machines.needsYou')}
            </Badge>
          )
        }
        onClick={() => navigate({ name: 'board', agentId })}
      />
    </ListGroup>
  )
}

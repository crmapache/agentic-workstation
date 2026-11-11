import { Plug, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import styles from '../MachinesScreen.module.scss'
import { useRouter } from '../../../../lib/router.store'
import type { MirroredInventory } from '../../../../state/remote.types'
import { ListGroup } from '../../../../shell/ListGroup/ListGroup'
import { ListRow } from '../../../../shell/ListRow/ListRow'
import { BoardRow } from './BoardRow'

/**
 * Экраны машины целиком, а не одного проекта: все очереди, аккаунты провайдера (чья подписка
 * платит, сколько осталось) и коннекторы IDE.
 */
export const MachineLinks = ({
  agentId,
  inventory,
}: {
  agentId: string
  inventory: MirroredInventory
}) => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)

  return (
    <ListGroup label={t('machines.screens')}>
      <BoardRow agentId={agentId} inventory={inventory} />
      <ListRow
        title={t('accounts.title')}
        leading={<UserRound className={styles.rowIcon} aria-hidden />}
        onClick={() => navigate({ name: 'accounts', agentId })}
      />
      <ListRow
        title={t('connectors.title')}
        leading={<Plug className={styles.rowIcon} aria-hidden />}
        onClick={() => navigate({ name: 'connectors', agentId })}
      />
    </ListGroup>
  )
}

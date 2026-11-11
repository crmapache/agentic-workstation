import { Search, History, Workflow } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import styles from '../ProjectScreen.module.scss'
import { useRouter } from '../../../../lib/router.store'
import { ListGroup } from '../../../../shell/ListGroup/ListGroup'
import { ListRow } from '../../../../shell/ListRow/ListRow'

/**
 * Дороги проекта дальше: прошлые разговоры (и у недавнего проекта - список читается и без
 * вкладки), а у открытого - поиск по разговорам и сценарии с их историей и расписанием.
 */
export const ProjectLinks = ({
  agentId,
  projectKey,
  open,
}: {
  agentId: string
  projectKey: string
  open: boolean
}) => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)

  return (
    <ListGroup label={t('project.more')}>
      <ListRow
        title={t('history.title')}
        leading={<History className={styles.rowIcon} aria-hidden />}
        onClick={() => navigate({ name: 'history', agentId, projectKey })}
      />
      {open && (
        <>
          <ListRow
            title={t('search.title')}
            leading={<Search className={styles.rowIcon} aria-hidden />}
            onClick={() => navigate({ name: 'search', agentId, projectKey })}
          />
          <ListRow
            title={t('scenarios.title')}
            leading={<Workflow className={styles.rowIcon} aria-hidden />}
            onClick={() => navigate({ name: 'scenarios', agentId, projectKey })}
          />
        </>
      )}
    </ListGroup>
  )
}

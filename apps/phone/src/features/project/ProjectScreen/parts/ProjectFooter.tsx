import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../ProjectScreen.module.scss'
import { useRouter } from '../../../../lib/router.store'

/**
 * Низ открытого проекта: запуск сценария слева, новый разговор - главное - справа, под большим
 * пальцем. Без иконок: в половину ширины телефона подпись с иконкой переносилась бы на две строки.
 */
export const ProjectFooter = ({ agentId, projectKey }: { agentId: string; projectKey: string }) => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)

  return (
    <div className={styles.footer}>
      <Button size="touch" onClick={() => navigate({ name: 'startScenario', agentId, projectKey })}>
        {t('project.startScenario')}
      </Button>
      <Button
        size="touch"
        variant="primary"
        onClick={() => navigate({ name: 'newConversation', agentId, projectKey })}>
        {t('project.newConversation')}
      </Button>
    </div>
  )
}

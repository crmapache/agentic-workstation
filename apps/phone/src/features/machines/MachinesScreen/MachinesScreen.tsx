import { ScanQrCode, Smartphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { useClient } from '../../../lib/client'
import { useRouter } from '../../../lib/router.store'
import { useMachines } from '../../../state/remote.queries'
import { Banner } from '../../../shell/Banner/Banner'
import { ListGroup } from '../../../shell/ListGroup/ListGroup'
import { ListRow } from '../../../shell/ListRow/ListRow'
import { Screen } from '../../../shell/Screen/Screen'
import styles from './MachinesScreen.module.scss'
import { MachineSection } from './parts/MachineSection'
import { NotificationsSection } from './parts/NotificationsSection'

/**
 * Первый экран: спаренные IDE (машины), у каждой - связь, открытые и недавние проекты. Проект -
 * ключом IDE, путь на диске сюда не приходит. Под ними - уведомления: сюда телефон приходит
 * сразу после пары, здесь их и предлагают. Пара вставленным адресом (приложение с экрана «Домой»
 * адрес из камеры не получает) - главная кнопка, пока пусто, а потом строкой в самом конце
 * списка: вторую IDE парят редко, и место под пальцем ей не нужно.
 */
export const MachinesScreen = () => {
  const { t } = useTranslation()
  const client = useClient()
  const machines = useMachines().data ?? []
  const navigate = useRouter((state) => state.navigate)

  const handlePair = () => navigate({ name: 'pair' })

  return (
    <Screen
      title={t('machines.title')}
      back={false}
      help={{ title: t('machines.help.title'), text: t('machines.help.text') }}
      banner={!client.persistent && <Banner tone="warning" text={t('machines.notPersistent')} />}>
      {machines.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title={t('machines.empty.title')}
          description={t('machines.empty.description')}
          action={
            <Button size="touch" variant="primary" icon={ScanQrCode} onClick={handlePair}>
              {t('machines.pairIde')}
            </Button>
          }
        />
      ) : (
        <>
          {machines.map((machine) => (
            <MachineSection key={machine.agentId} machine={machine} />
          ))}
          <NotificationsSection />
          <ListGroup label={t('machines.pairAnother')}>
            <ListRow
              title={t('machines.pairAnother')}
              leading={<ScanQrCode className={styles.rowIcon} aria-hidden />}
              onClick={handlePair}
            />
          </ListGroup>
        </>
      )}
    </Screen>
  )
}

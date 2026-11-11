import { Link2, Smartphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { useClient } from '../../../lib/client'
import { useRouter } from '../../../lib/router.store'
import { useMachines } from '../../../state/remote.queries'
import { Banner } from '../../../shell/Banner/Banner'
import { Screen } from '../../../shell/Screen/Screen'
import { MachineSection } from './parts/MachineSection'
import { NotificationsSection } from './parts/NotificationsSection'

/**
 * Первый экран: спаренные IDE (машины), у каждой - связь, открытые и недавние проекты. Проект -
 * ключом IDE, путь на диске сюда не приходит. Под ними - уведомления: сюда телефон приходит
 * сразу после пары, здесь их и предлагают. Внизу - пара вставленным адресом: приложение с
 * экрана «Домой» адрес из камеры не получает.
 */
export const MachinesScreen = () => {
  const { t } = useTranslation()
  const client = useClient()
  const machines = useMachines().data ?? []
  const navigate = useRouter((state) => state.navigate)

  return (
    <Screen
      title={t('machines.title')}
      back={false}
      help={{ title: t('machines.help.title'), text: t('machines.help.text') }}
      banner={!client.persistent && <Banner tone="warning" text={t('machines.notPersistent')} />}
      footer={
        <Button
          size="touch"
          variant="secondary"
          icon={Link2}
          onClick={() => navigate({ name: 'pair' })}>
          {t('machines.pairIde')}
        </Button>
      }>
      {machines.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title={t('machines.empty.title')}
          description={t('machines.empty.description')}
        />
      ) : (
        <>
          {machines.map((machine) => (
            <MachineSection key={machine.agentId} machine={machine} />
          ))}
          <NotificationsSection />
        </>
      )}
    </Screen>
  )
}

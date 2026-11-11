import { Smartphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { useClient } from '../../../lib/client'
import { useMachines } from '../../../state/remote.queries'
import { Banner } from '../../../shell/Banner/Banner'
import { Screen } from '../../../shell/Screen/Screen'
import { MachineSection } from './parts/MachineSection'

/**
 * Первый экран: спаренные IDE (машины), у каждой - связь, открытые и недавние проекты. Проект -
 * ключом IDE, путь на диске сюда не приходит.
 */
export const MachinesScreen = () => {
  const { t } = useTranslation()
  const client = useClient()
  const machines = useMachines().data ?? []

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
        />
      ) : (
        machines.map((machine) => <MachineSection key={machine.agentId} machine={machine} />)
      )}
    </Screen>
  )
}

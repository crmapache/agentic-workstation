import { useRouter } from '../../lib/router.store'
import { BoardScreen } from '../../features/board/BoardScreen/BoardScreen'
import { ConversationScreen } from '../../features/conversation/ConversationScreen/ConversationScreen'
import { HistoryScreen } from '../../features/history/HistoryScreen/HistoryScreen'
import { MachinesScreen } from '../../features/machines/MachinesScreen/MachinesScreen'
import { NewConversationScreen } from '../../features/new-conversation/NewConversationScreen/NewConversationScreen'
import { PairingScreen } from '../../features/pairing/PairingScreen/PairingScreen'
import { ProjectScreen } from '../../features/project/ProjectScreen/ProjectScreen'
import { QueueScreen } from '../../features/queue/QueueScreen/QueueScreen'
import { RunScreen } from '../../features/run/RunScreen/RunScreen'
import { StartScenarioScreen } from '../../features/start-scenario/StartScenarioScreen/StartScenarioScreen'

/** Экран по адресу. Ключ - сам адрес: другой разговор - новый экран, без остатков прежнего. */
export const AppRoutes = () => {
  const route = useRouter((state) => state.route)

  switch (route.name) {
    case 'pair':
      return <PairingScreen />
    case 'project':
      return <ProjectScreen key={route.projectKey} route={route} />
    case 'board':
      return <BoardScreen key={route.agentId} route={route} />
    case 'history':
      return <HistoryScreen key={route.projectKey} route={route} />
    case 'newConversation':
      return <NewConversationScreen route={route} />
    case 'startScenario':
      return <StartScenarioScreen route={route} />
    case 'conversation':
      return <ConversationScreen key={route.conversationId} route={route} />
    case 'queue':
      return <QueueScreen key={route.queueId} route={route} />
    case 'run':
      return <RunScreen key={route.runId} route={route} />
    case 'machines':
    case 'notFound':
      return <MachinesScreen />
  }
}

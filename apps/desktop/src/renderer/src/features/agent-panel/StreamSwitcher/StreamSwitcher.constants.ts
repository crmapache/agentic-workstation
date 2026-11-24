import type { ParseKeys } from 'i18next'

import type { ShellKind } from './StreamSwitcher.types'

/** Слова фоновой задачи процесса: имя на чипе, заголовок её панели, остановка и вопрос перед ней. */
export const SHELL_KEYS: Record<
  ShellKind,
  { name: ParseKeys; title: ParseKeys; stop: ParseKeys; stopTitle: ParseKeys }
> = {
  command: {
    name: 'agentPanel.agents.streams.background',
    title: 'agentPanel.agents.streams.commandTitle',
    stop: 'agentPanel.agents.streams.stopCommand',
    stopTitle: 'agentPanel.agents.streams.stopCommandTitle',
  },
  monitor: {
    name: 'agentPanel.agents.streams.monitor',
    title: 'agentPanel.agents.streams.monitorTitle',
    stop: 'agentPanel.agents.streams.stopMonitor',
    stopTitle: 'agentPanel.agents.streams.stopMonitorTitle',
  },
}

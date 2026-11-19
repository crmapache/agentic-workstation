import { join } from 'node:path'

import type { ProviderId } from '@shared/providers'
import type { ServiceAi } from '@shared/service-ai'

import type { ClaudeService } from '../claude/claude-service'
import type { CodexService } from '../codex/codex-service'
import type { OpenModelsService } from '../opencode/opencode-service'
import type { ScenarioProvider } from './scenario-provider'
import { claudeScenarioProvider } from './claude/claude-scenarios'
import { CODEX_RUNS_DIR, codexScenarioProvider } from './codex/codex-scenarios'
import { OPENCODE_RUNS_DIR, openCodeScenarioProvider } from './opencode/opencode-scenarios'

/**
 * Исполнители провайдеров для работы без вкладки (docs/plan-providers/50-ide.md): сценарии и
 * задания берут одних и тех же - у Claude Code свой поток, у Codex и открытых моделей -
 * переводчик в него. Один набор на IDE: память отказов лимита и черновики общие.
 */
export const runProviders = (panels: {
  claude: ClaudeService
  codex: CodexService
  openModels: OpenModelsService
  dataDir: string
  /** Settings → AI: модель служебной работы - тому провайдеру, который её делает. */
  service: () => ServiceAi
}): ReadonlyMap<ProviderId, ScenarioProvider> => {
  const serviceModel = (id: ProviderId) => () =>
    panels.service().provider === id ? panels.service().model : ''

  return new Map(
    [
      claudeScenarioProvider(panels.claude, panels.dataDir, serviceModel('claude')),
      codexScenarioProvider(panels.codex, panels.dataDir, serviceModel('codex')),
      openCodeScenarioProvider(panels.openModels, panels.dataDir, serviceModel('opencode')),
    ].map((provider) => [provider.id, provider]),
  )
}

/** Папка журналов сессий провайдера без транскриптов Claude (run-journal.ts); у Claude - пусто. */
export const runJournalsDir = (dataDir: string, provider: ProviderId): string =>
  provider === 'codex'
    ? join(dataDir, CODEX_RUNS_DIR)
    : provider === 'opencode'
      ? join(dataDir, OPENCODE_RUNS_DIR)
      : ''

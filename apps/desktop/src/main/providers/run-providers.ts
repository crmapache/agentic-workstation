import { join } from 'node:path'

import type { ProviderId } from '@shared/providers'
import type { ServiceAi } from '@shared/service-ai'

import type { AcpPanel } from '../acp/acp-panel'
import type { ClaudeService } from '../claude/claude-service'
import type { CodexService } from '../codex/codex-service'
import type { OpenModelsService } from '../opencode/opencode-service'
import { withLocalTime } from '../agents/conversation/local-time-briefing'
import type { ScenarioProvider } from './scenario-provider'
import { acpRunsDir, acpScenarioProvider } from './acp/acp-scenarios'
import { claudeScenarioProvider } from './claude/claude-scenarios'
import { CODEX_RUNS_DIR, codexScenarioProvider } from './codex/codex-scenarios'
import { OPENCODE_RUNS_DIR, openCodeScenarioProvider } from './opencode/opencode-scenarios'

/**
 * Каждой сессии без вкладки - пояс человека в конце брифа (agents/conversation/local-time-briefing.ts):
 * отчёты прогонов, заданий и разговоров о коннекторах он читает так же, как панель. Здесь, а не у
 * каждого исполнителя: мимо этой точки сессию не поднять, а бриф у провайдеров едет по-разному.
 */
const withPersonTime = (provider: ScenarioProvider): ScenarioProvider => ({
  ...provider,
  spawn: (spec, place, wires) =>
    provider.spawn({ ...spec, briefing: withLocalTime(spec.briefing) }, place, wires),
})

/**
 * Исполнители провайдеров для работы без вкладки (docs/plan-providers/50-ide.md): сценарии и
 * задания берут одних и тех же - у Claude Code свой поток, у Codex, Kimi и открытых моделей -
 * переводчик в него. Один набор на IDE: память отказов лимита и черновики общие. У Antigravity
 * исполнителя нет: без человека ему работать нельзя (ADR 0094).
 */
export const runProviders = (panels: {
  claude: ClaudeService
  codex: CodexService
  kimi: AcpPanel
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
      acpScenarioProvider(panels.kimi, panels.dataDir, serviceModel('kimi')),
      openCodeScenarioProvider(panels.openModels, panels.dataDir, serviceModel('opencode')),
    ].map((provider) => [provider.id, withPersonTime(provider)]),
  )
}

/**
 * Папка журналов сессий прогонов от userData (run-journal.ts). Пусто - журналов нет: у Claude
 * свои транскрипты, у Antigravity прогонов нет вовсе (ADR 0094).
 */
const RUN_DIRS: Record<ProviderId, string> = {
  claude: '',
  codex: CODEX_RUNS_DIR,
  antigravity: '',
  kimi: acpRunsDir('kimi'),
  opencode: OPENCODE_RUNS_DIR,
}

/** Папка журналов сессий провайдера без транскриптов Claude (run-journal.ts); нет - пусто. */
export const runJournalsDir = (dataDir: string, provider: ProviderId): string =>
  RUN_DIRS[provider] ? join(dataDir, RUN_DIRS[provider]) : ''

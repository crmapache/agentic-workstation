import type { ModelInfo, AgentPanelState } from '@shared/conversation'
import type { ProviderId, ProviderInfo, ProviderModel } from '@shared/providers'
import { PROVIDER_IDS } from '@shared/providers'

import type { ClaudeService } from '../claude/claude-service'
import type { AgentPanel } from '../agents/panel/agent-panel'
import type { PanelRegistry } from '../agents/panel/panel-registry'
import { claudeProvider, claudeProviderOf } from './claude/claude-provider'

/** Имена провайдеров для всего, что не панель (как подписи их панелей). */
const LABELS: Record<Exclude<ProviderId, 'claude'>, string> = {
  codex: 'Codex',
  opencode: 'Open models',
}

/** Модель панели - моделью провайдера: уровни усилия, «по умолчанию» и группа едут с ней. */
const modelOf = (model: ModelInfo): ProviderModel => ({
  value: model.value,
  displayName: model.displayName,
  description: model.description,
  custom: false,
  ...(model.efforts && { efforts: model.efforts }),
  ...(model.defaultEffort && { defaultEffort: model.defaultEffort }),
  ...(model.isDefault && { isDefault: true }),
  ...(model.group && { group: model.group }),
})

/**
 * Провайдер по состоянию его панели (Codex, открытые модели): CLI на месте, модели каталога
 * или подключений, режимы и уровни - возможности панели. CLI ещё ищут - null: сказать
 * «нет CLI» было бы неправдой.
 */
export const panelProviderOf = (
  provider: Exclude<ProviderId, 'claude'>,
  state: Pick<AgentPanelState, 'cli' | 'models' | 'capabilities'>,
): ProviderInfo | null =>
  state.cli === 'unknown'
    ? null
    : {
        id: provider,
        label: LABELS[provider],
        available: state.cli === 'found',
        unavailable: state.cli === 'found' ? null : 'noCli',
        models: state.models.map(modelOf),
        modes: state.capabilities.modes,
        efforts: state.capabilities.efforts,
      }

/** Что из состояния панели нужно провайдеру. */
type PanelFacts = Pick<AgentPanelState, 'cli' | 'models' | 'prefs' | 'capabilities'>

/** Провайдер по состоянию панели любого провайдера. */
export const providerOf = (provider: ProviderId, state: PanelFacts): ProviderInfo | null =>
  provider === 'claude' ? claudeProviderOf(state) : panelProviderOf(provider, state)

/** Откуда берутся провайдеры: панель Claude и панели остальных, какие есть. */
export type ProviderSources = {
  claude: ClaudeService
  codex?: AgentPanel | undefined
  opencode?: AgentPanel | undefined
}

/**
 * Провайдеры ИИ для окна (docs/plan-providers/50-ide.md): кто есть, на месте ли, на каких
 * моделях, с какими режимами и уровнями. CLI Claude ищется заново на каждый вопрос: его могли
 * поставить, пока IDE открыта; у Codex и OpenCode, если ещё не искали, - поиск сейчас.
 */
export const listProviders = async (sources: ProviderSources): Promise<ProviderInfo[]> => {
  const { claude } = sources
  const cli = await claude.cli.locate()
  const others = await Promise.all(
    (['codex', 'opencode'] as const).map(async (id) => {
      const panel = sources[id]

      if (!panel) return null
      if (panel.getState().cli === 'unknown') await panel.recheckCli()

      return panelProviderOf(id, panel.getState())
    }),
  )

  return [
    claudeProvider({
      found: cli !== null,
      catalog: claude.cli.models,
      customModels: claude.settings.prefs.customModels,
    }),
    ...others.filter((provider) => provider !== null),
  ]
}

/**
 * Провайдеры окну свежими: каталог моделей пришёл, человек добавил свою модель, подключение
 * открытых моделей ответило, CLI нашёлся или пропал - событие providers:changed. Считается по
 * каждому состоянию панели, а уходит, только когда список правда стал другим, - не на каждую
 * букву ответа модели.
 */
export class ProviderWatch {
  private sent = ''

  /** panels - все панели IDE: список собирается по их текущим состояниям, а не по запомненным. */
  constructor(
    private readonly send: (providers: ProviderInfo[]) => void,
    private readonly panels: Pick<PanelRegistry, 'find'>,
  ) {}

  /**
   * Состояние панели поменялось: список - по состоянию каждой панели сейчас (пришедшее - этой),
   * иначе первое событие после старта (от Codex) пришло бы без Claude и затёрло бы окну список.
   */
  changed(provider: ProviderId, state: PanelFacts): void {
    const providers = PROVIDER_IDS.flatMap((id) => {
      const facts = id === provider ? state : this.panels.find(id)?.getState()

      return (facts && providerOf(id, facts)) ?? []
    })
    const print = JSON.stringify(providers)

    // CLI всех панелей ещё ищут: сказать окну «провайдеров нет» было бы неправдой.
    if (providers.length === 0 || print === this.sent) return

    this.sent = print
    this.send(providers)
  }
}

import type { EffortLevel, PermissionMode } from './conversation'
import { EFFORT_LEVELS, PERMISSION_MODES, CODEX_EFFORT_LEVELS } from './conversation'
import { REASONING_LEVELS } from './open-models'
import type { ProviderId } from './providers'
import type { RewindScope } from './rewind'

/**
 * Что умеет провайдер панели (ADR 0083). Окно показывает кнопку, экран или команду, только
 * если провайдер их объявил: без заглушек, которые потом молча ничего не делают.
 */
export type PanelCapabilities = {
  provider: ProviderId
  /** Режимы разрешений меню MODE и Shift+Tab, по порядку. */
  modes: readonly PermissionMode[]
  /** Уровни усилия, когда у модели нет своего списка (ModelInfo.efforts). */
  efforts: readonly EffortLevel[]
  /** Форк разговора (в новой вкладке целиком). */
  fork: boolean
  /** Форк с сообщения (выделение, диалог отката); без него форк - только весь разговор. */
  forkAtMessage: boolean
  /** Откат к сообщению: области - rewindScopes. */
  rewind: boolean
  /** Откат кода к сообщению (копии файлов CLI). */
  rewindFiles: boolean
  /**
   * Что можно откатить: только разговор, только код, оба. OpenCode откатывает код только
   * вместе с разговором (его снимки), поэтому «только код» у него не предлагается.
   */
  rewindScopes: readonly RewindScope[]
  /** Вопрос сбоку (/btw), быстрый режим, остановка фоновой задачи. */
  sideQuestion: boolean
  fastMode: boolean
  stopTask: boolean
  /** Экраны бокового меню провайдера. */
  plugins: boolean
  config: boolean
  customModels: boolean
  /** Чьи аккаунты: экран аккаунтов, вход, кольца лимитов. */
  /** acp - один вход агента ACP силами его CLI (ADR 0092): экран входа, а не список. */
  accounts: 'claude' | 'codex' | 'acp' | 'none'
  /** Путь к CLI руками на экране «CLI не найден». */
  cliPath: boolean
  /** Подключения моделей (Ollama, LM Studio, OpenRouter, свой адрес) - экран в меню панели. */
  connections: boolean
  /**
   * Слои настроек проекта (`.claude/settings*.json` и управляемые): они могут запретить режим
   * без вопросов, и меню MODE его тогда не даёт.
   */
  settingsLayers: boolean
  /** Поиск по разговорам и токены за день по журналам провайдера. */
  search: boolean
  todayTokens: boolean
  /** Продолжение после лимита и моды CLI. */
  carryOn: boolean
  /**
   * Встроенные команды провайдера, которые подсказка «/» показывает до первого хода, сверх
   * выбора модели и усилия: у Claude - /context, /cost, /usage, /code-review, у Codex -
   * /compact и /review.
   */
  commands: readonly string[]
  /** Команды и навыки с диска проекта и пользователя. */
  diskCommands: boolean
  /**
   * Пресеты модели, усилия и режима кнопками под полем и их экран в Settings (ADR 0096): у
   * Claude Code, Codex, Kimi и Antigravity - по просьбе владельца; у открытых моделей нет.
   */
  presets: boolean
}

/** Возможности Claude Code: всё, что умеет панель. */
export const CLAUDE_CAPABILITIES: PanelCapabilities = {
  provider: 'claude',
  modes: PERMISSION_MODES,
  efforts: EFFORT_LEVELS,
  fork: true,
  forkAtMessage: true,
  rewind: true,
  rewindFiles: true,
  rewindScopes: ['conversation', 'code', 'both'],
  sideQuestion: true,
  fastMode: true,
  stopTask: true,
  plugins: true,
  config: true,
  customModels: true,
  accounts: 'claude',
  cliPath: true,
  connections: false,
  settingsLayers: true,
  search: true,
  todayTokens: true,
  carryOn: true,
  commands: ['context', 'cost', 'usage', 'code-review'],
  diskCommands: true,
  presets: true,
}

/**
 * Возможности Codex (docs/plan-providers/30-codex.md). Форк и откат разговора - через его
 * журнал; код - обратными правками (копий файлов у Codex нет). Быстрый режим - уровень
 * обслуживания `priority`; вопроса сбоку, плагинов, своих моделей и поиска по журналам нет.
 */
export const CODEX_CAPABILITIES: PanelCapabilities = {
  provider: 'codex',
  modes: ['default', 'acceptEdits', 'readOnly', 'plan', 'bypassPermissions'],
  efforts: CODEX_EFFORT_LEVELS,
  fork: true,
  forkAtMessage: true,
  rewind: true,
  rewindFiles: true,
  rewindScopes: ['conversation', 'code', 'both'],
  sideQuestion: false,
  fastMode: true,
  stopTask: false,
  plugins: false,
  config: false,
  customModels: false,
  accounts: 'codex',
  cliPath: false,
  connections: false,
  settingsLayers: false,
  search: false,
  todayTokens: false,
  carryOn: false,
  commands: ['compact', 'review'],
  diskCommands: false,
  presets: true,
}

/**
 * Возможности открытых моделей через OpenCode (docs/plan-providers/40-open-models.md): модели
 * из подключений, усилие - вариантами модели, режимы - правилами сессии; форк, откат разговора
 * и кода - силами OpenCode (его снимки файлов); аккаунтов и лимитов подписки нет.
 */
export const OPENCODE_CAPABILITIES: PanelCapabilities = {
  provider: 'opencode',
  modes: ['default', 'acceptEdits', 'readOnly', 'plan', 'bypassPermissions'],
  // Все уровни, какие бывают у открытых моделей; у каждой модели - свой список (ModelInfo.efforts).
  efforts: REASONING_LEVELS,
  fork: true,
  forkAtMessage: true,
  rewind: true,
  rewindFiles: true,
  rewindScopes: ['conversation', 'both'],
  sideQuestion: false,
  fastMode: false,
  stopTask: false,
  plugins: false,
  config: false,
  customModels: false,
  accounts: 'none',
  cliPath: false,
  connections: true,
  settingsLayers: false,
  search: false,
  todayTokens: false,
  carryOn: false,
  commands: ['compact'],
  diskCommands: false,
  presets: false,
}

/**
 * Возможности агентов ACP (ADR 0092): общее у Antigravity и Kimi. Форка с хода и отката
 * разговора ACP не даёт - их нет; откат - только кода, обратными правками по диффам ленты
 * (acp-rewind.ts); форк целиком - у агента, который объявил `session/fork` (Kimi). Модели,
 * уровни размышления и режимы - от агента (состояние панели), здесь - до первого ответа.
 */
const ACP_BASE: Omit<PanelCapabilities, 'provider' | 'modes' | 'efforts'> = {
  fork: false,
  forkAtMessage: false,
  rewind: true,
  rewindFiles: true,
  rewindScopes: ['code'],
  sideQuestion: false,
  fastMode: false,
  stopTask: false,
  plugins: false,
  config: false,
  customModels: false,
  accounts: 'acp',
  cliPath: false,
  connections: false,
  settingsLayers: false,
  search: false,
  todayTokens: false,
  carryOn: false,
  commands: [],
  diskCommands: false,
  presets: true,
}

/**
 * Google Antigravity (`agy acp`): режимы ACP «Default», «Accept edits», «Auto», «Plan» и «без
 * вопросов» - флагом запуска `--dangerously-skip-permissions`; уровни размышления Gemini.
 */
export const ANTIGRAVITY_CAPABILITIES: PanelCapabilities = {
  ...ACP_BASE,
  provider: 'antigravity',
  modes: ['default', 'acceptEdits', 'auto', 'plan', 'bypassPermissions'],
  efforts: ['low', 'medium', 'high'],
}

/**
 * Kimi Code (`kimi acp`): «Default» спрашивает команды, правки в проекте - нет; «YOLO» (auto)
 * спрашивает только опасные команды; «Auto» Kimi (без вопросов) - ничего; план.
 */
export const KIMI_CAPABILITIES: PanelCapabilities = {
  ...ACP_BASE,
  provider: 'kimi',
  fork: true,
  modes: ['default', 'auto', 'plan', 'bypassPermissions'],
  efforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
}

/** Возможности каждого провайдера: таблица, а не развилка - новый не забудется (ADR 0093). */
const CAPABILITIES: Record<ProviderId, PanelCapabilities> = {
  claude: CLAUDE_CAPABILITIES,
  codex: CODEX_CAPABILITIES,
  antigravity: ANTIGRAVITY_CAPABILITIES,
  kimi: KIMI_CAPABILITIES,
  opencode: OPENCODE_CAPABILITIES,
}

/**
 * Возможности провайдера, пока главный процесс не прислал свои (state.capabilities): окно
 * сразу рисует панель как она будет, без кнопок другого провайдера на первом кадре.
 */
export const capabilitiesOf = (provider: ProviderId): PanelCapabilities => CAPABILITIES[provider]

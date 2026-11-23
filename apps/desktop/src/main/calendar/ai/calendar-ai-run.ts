import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import type { CalendarFailure } from '@shared/calendar'
import { CALENDAR_AI_PROVIDERS } from '@shared/calendar'
import type { AiChoice } from '@shared/ide-prefs'
import type { ProviderId } from '@shared/providers'
import { MINUTE_MS } from '@shared/time-units'

import type { SourceResult } from '../calendar-snapshot'
import type { AiSource } from '../calendar-sync'
import type { SyncWindow } from '../calendar-window'
import { aiWindow } from '../calendar-window'
import type { ClaudeService } from '../../claude/claude-service'
import { askStructured } from '../../claude/structured-ask'
import type { CalendarConnectors } from '../../connectors/calendar-access'
import type { ScenarioProvider } from '../../providers/scenario-provider'
import type { LaunchGrant, GatewayLaunch } from '../../connectors/gateway/launches'
import { calendarBrief } from './calendar-ai-brief'
import { parseCalendarAnswer } from './calendar-ai-parse'
import { CALENDAR_AI_SCHEMA } from './calendar-ai-schema'

/** Чтение страницы - минуты: листание недель рукой со скоростью человека. Дольше - зависло. */
const BROWSER_MS = 8 * MINUTE_MS
const SCREEN_MS = 10 * MINUTE_MS

/**
 * Инструменты чтения календаря. Набора текста, скриптов, загрузки, чужих вкладок и списка вкладок
 * человека нет: читать календарь они не помогают, а страница могла бы уговорить модель на них.
 */
const BROWSER_TOOLS = [
  'open',
  'navigate',
  'snapshot',
  'screenshot',
  'scroll',
  'wait',
  'back',
  'forward',
  'reload',
  'finish',
  'close_tab',
]
const BROWSER_CLICK_TOOLS = ['click', 'press', 'hover']
const SCREEN_TOOLS = ['screenshot', 'zoom', 'open_app', 'scroll', 'click', 'key']

export type CalendarAiDeps = {
  connectors: CalendarConnectors
  /** Компьютер: держит ли его другой разговор и есть ли разрешения. */
  computer: { holding: () => string | null; ready: () => boolean }
  claude: ClaudeService
  runners: ReadonlyMap<ProviderId, ScenarioProvider>
  dataDir: string
  now: () => number
  machineZone: () => string
  /** Кому можно читать календарь; по умолчанию - прошедшим проверку (CALENDAR_AI_PROVIDERS). */
  providers?: readonly ProviderId[]
}

/** Ответ одного провайдера; next - он сам не смог (нет CLI, сбой), пора спросить следующего. */
type Attempt = { result: SourceResult; next: boolean }

const failed = (failure: CalendarFailure, next = false): Attempt => ({
  result: { ok: false, failure },
  next,
})

/** Статус и пояснение из ответа модели - для журнала. */
const noteOf = (output: unknown): string =>
  typeof output === 'object' && output !== null
    ? `${String((output as Record<string, unknown>)['status'])}: ${String((output as Record<string, unknown>)['note'])}`
    : String(output)

const grantOf = (source: AiSource, serverName: string): LaunchGrant => {
  if (source.kind === 'ai-screen') {
    return {
      tools: new Map([[serverName, SCREEN_TOOLS]]),
      pin: { browserProfile: null, hosts: [] },
    }
  }

  return {
    tools: new Map([
      [serverName, [...BROWSER_TOOLS, ...(source.allowClicks ? BROWSER_CLICK_TOOLS : [])]],
    ]),
    pin: { browserProfile: source.profile, hosts: [new URL(source.url).hostname] },
  }
}

/**
 * Чтение календаря ИИ (ADR 0114): разовый прогон провайдера со схемой ответа, только с выбранным
 * коннектором (Browser или Computer) через допуск шлюза, в своей папке. Провайдеры - цепочкой
 * источника: не ответил (нет CLI, сбой) - следующий; страница сказала «нужен вход» - это ответ.
 * Вкладки разговора закрываются сразу после ответа (end), а не через десять минут ожидания.
 */
export class CalendarAiReader {
  /** Идущие прогоны по разговору: Stop в капсуле Computer гасит и их. */
  private readonly active = new Map<string, AbortController>()

  constructor(private readonly deps: CalendarAiDeps) {}

  /** Stop в капсуле Computer: разговор чтения календаря гаснет. */
  stop(conversationId: string): void {
    this.active.get(conversationId)?.abort()
  }

  async read(source: AiSource, signal: AbortSignal): Promise<SourceResult> {
    const kind = source.kind === 'ai-browser' ? 'browser' : 'computer'
    const connector = this.deps.connectors.connector(source.connectorId, [kind])

    if (typeof connector === 'string') return { ok: false, failure: connector }
    if (kind === 'computer' && !this.deps.computer.ready()) {
      return { ok: false, failure: 'computer-denied' }
    }
    if (kind === 'computer' && this.deps.computer.holding()) {
      return { ok: false, failure: 'computer-busy' }
    }

    const allowed = this.deps.providers ?? CALENDAR_AI_PROVIDERS
    const chain = source.ai.filter((choice) => allowed.includes(choice.provider))
    const window = aiWindow(this.deps.now(), source.weeksAhead)
    const grant = grantOf(source, connector.serverName)
    let last: CalendarFailure = chain.length ? 'provider-missing' : 'provider-unsupported'

    for (const choice of chain) {
      const attempt = await this.attempt(source, choice, grant, window, signal)

      if (!attempt.next) return attempt.result
      if (!attempt.result.ok) last = attempt.result.failure
    }

    return { ok: false, failure: last }
  }

  private async attempt(
    source: AiSource,
    choice: AiChoice,
    grant: LaunchGrant,
    window: SyncWindow,
    signal: AbortSignal,
  ): Promise<Attempt> {
    // Имя папки - подпись группы вкладок в Chrome: «AW · Calendar».
    const workDir = join(this.deps.dataDir, 'calendar', 'Calendar')
    const conversationId = `calendar:${source.id}:${randomUUID()}`
    const controller = new AbortController()
    const timeoutMs = source.kind === 'ai-browser' ? BROWSER_MS : SCREEN_MS
    const stop = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(timeoutMs)])
    const prompt = calendarBrief(source, window, this.deps.now(), this.deps.machineZone())
    const gateway = this.deps.connectors.gateway
    // Claude Code берёт шлюз файлом конфига, остальные - серверами и ключом в памяти.
    const file = choice.provider === 'claude' ? await gateway.openGranted(workDir, grant) : null
    const launch = file ?? gateway.openGrantedInMemory(workDir, grant)

    if (!launch) return failed('connector-off')

    launch.own({ conversationId, workDir })
    this.active.set(conversationId, controller)

    try {
      const answer = file
        ? await this.askClaude(choice, prompt, file.path, file.allowed, workDir, timeoutMs, stop)
        : await this.askRunner(choice, prompt, launch, workDir, timeoutMs, stop)

      if (signal.aborted || controller.signal.aborted) return failed('cancelled')
      if ('error' in answer) {
        return failed(
          stop.aborted ? 'timeout' : answer.missing ? 'provider-missing' : 'ai-failed',
          true,
        )
      }

      const result = parseCalendarAnswer(answer.output, source.id, window)

      // Отказ страницы или ответа - словами модели в журнал: окну хватает кода причины.
      if (!result.ok) console.warn('[calendar] ИИ не прочитал календарь:', noteOf(answer.output))

      return { result, next: false }
    } finally {
      this.active.delete(conversationId)
      launch.end()
      launch.release()
    }
  }

  private async askClaude(
    choice: AiChoice,
    prompt: string,
    mcpConfig: string,
    mcpTools: readonly string[],
    cwd: string,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<{ output: unknown } | { error: string; missing: boolean }> {
    const { claude } = this.deps
    const cli = await claude.cli.locate()

    if (!cli) return { error: 'Claude Code is not found.', missing: true }

    const result = await askStructured(
      { ...cli, env: claude.accounts.envFor(cli.env) },
      {
        prompt,
        schema: CALENDAR_AI_SCHEMA,
        tools: [],
        ...(choice.model && { model: choice.model }),
        ...(choice.effort && { effort: choice.effort }),
        mcpConfig,
        mcpTools,
        cwd,
        timeoutMs,
        signal,
      },
    )

    if ('output' in result) return { output: result.output }

    console.warn('[calendar] Claude не прочитал календарь:', result.failure, result.detail)

    return { error: result.detail || result.failure, missing: false }
  }

  private async askRunner(
    choice: AiChoice,
    prompt: string,
    gateway: GatewayLaunch,
    cwd: string,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<{ output: unknown } | { error: string; missing: boolean }> {
    const askOnce = this.deps.runners.get(choice.provider)?.askOnce

    if (!askOnce)
      return { error: `${choice.provider} cannot read in the background.`, missing: true }

    const result = await askOnce({
      prompt,
      schema: CALENDAR_AI_SCHEMA,
      model: choice.model,
      effort: choice.effort,
      cwd,
      timeoutMs,
      signal,
      gateway,
    })

    if ('error' in result) {
      console.warn(`[calendar] ${choice.provider} не прочитал календарь:`, result.error)

      return { error: result.error, missing: false }
    }

    return result.output === null
      ? { error: 'not JSON', missing: false }
      : { output: result.output }
  }
}

import { modelRefOf } from '../connections/opencode-config'
import type { OpenCodeServer } from '../server/opencode-server'
import { dataOf } from '../server/opencode-server'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { localTimeBriefing } from '../../agents/conversation/local-time-briefing'
import { openCodeOf } from './opencode-conversation'
import { agentFor, rulesFor } from './opencode-modes'

/**
 * Ключ указаний сессии с поясом человека. Свой, не ключ брифа прогона (BRIEFING_KEY): бриф
 * снимается, когда прогон открывают чатом, а пояс должен остаться.
 */
const LOCAL_TIME_KEY = 'agentic-workstation-local-time'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Настройки сессии разговора у OpenCode (ADR 0084): модель с вариантом усилия, агент и правила
 * режима. Помнит, что сессия уже знает, и шлёт только поменявшееся: смена посреди разговора -
 * без перезапуска. Правила режима нужны и субагентам: OpenCode заводит их без них.
 */
export class OpenCodeSessionSettings {
  /** Что сессия уже знает: модель с вариантом, агент, правила - чтобы не слать лишнего. */
  private applied = { model: '', agent: '', rules: '' }

  constructor(
    private readonly runtime: ConversationRuntime,
    private readonly server: OpenCodeServer,
  ) {}

  /** Окно контекста модели разговора - для кольца контекста. */
  contextWindow(): number {
    return openCodeOf(this.runtime).host.contextWindow(this.modelValue())
  }

  /** Новая сессия в папке проекта - сразу с моделью, агентом и правилами режима; ответ - её id. */
  async create(): Promise<string> {
    const { meta } = this.runtime
    const model = this.modelRef()
    const rules = this.rules()
    const agent = agentFor(meta.permissionMode)
    const reply = await this.server.request('POST', '/api/session', {
      body: {
        location: { directory: meta.projectPath },
        agent,
        permissions: rules,
        ...(model && { model }),
      },
    })
    const created = dataOf(reply)
    const id = isRecord(created) && typeof created['id'] === 'string' ? created['id'] : ''

    if (!id) throw new Error('opencode serve: сессия без id')

    this.applied = { model: JSON.stringify(model), agent, rules: JSON.stringify(rules) }

    return id
  }

  /**
   * Модель, агент и правила режима - сессии, если поменялись с прошлого раза; новые правила - и
   * субагентам: они живут с разговором. Ответ - сменилась ли модель (окно контекста другое).
   */
  async apply(sessionId: string, children: Iterable<string>): Promise<boolean> {
    const { meta } = this.runtime
    const base = `/api/session/${sessionId}`
    const model = this.modelRef()
    const modelKey = JSON.stringify(model)
    const agent = agentFor(meta.permissionMode)
    const rules = this.rules()
    const rulesKey = JSON.stringify(rules)
    const modelChanged = model !== null && modelKey !== this.applied.model

    if (modelChanged) {
      await this.server.request('POST', `${base}/model`, { body: { model } })
      this.applied.model = modelKey
    }

    if (agent !== this.applied.agent) {
      await this.server.request('POST', `${base}/agent`, { body: { agent } })
      this.applied.agent = agent
    }

    if (rulesKey !== this.applied.rules) {
      await this.server.request('PATCH', base, { body: { permissions: rules } })
      this.applied.rules = rulesKey
      await Promise.all(
        [...children].map((child) =>
          this.server
            .request('PATCH', `/api/session/${child}`, { body: { permissions: rules } })
            .catch(() => undefined),
        ),
      )
    }

    return modelChanged
  }

  /**
   * Пояс человека - указаниями сессии, на каждый подъём процесса: смещение берётся на сейчас.
   * Старый OpenCode их не знает - разговор идёт без них, это не повод его ронять.
   */
  async brief(sessionId: string): Promise<void> {
    await this.server
      .request(
        'PUT',
        `/api/experimental/session/${sessionId}/instructions/entries/${LOCAL_TIME_KEY}`,
        {
          body: { value: localTimeBriefing() },
        },
      )
      .catch((error: unknown) => console.warn('[opencode] пояс человека не передан:', error))
  }

  /**
   * Правила режима - субагенту (иначе в «Ask», «Read only» и «Plan» он правил бы и запускал
   * команды по правилам своего агента). Ставятся вдогонку: до них субагент успевает разве что
   * подумать.
   */
  adopt(childId: string): void {
    void this.server
      .request('PATCH', `/api/session/${childId}`, { body: { permissions: this.rules() } })
      .catch((error: unknown) => console.warn('[opencode] правила субагенту не встали:', error))
  }

  /** Правила режима разговора с тем, что разрешено без вопроса. */
  private rules() {
    const kit = openCodeOf(this.runtime)

    // Без вопроса - свои серверы IDE процесса и то, что человек разрешил в этом разговоре.
    return rulesFor(this.runtime.meta.permissionMode, [...kit.allowedActions, ...kit.allowedHere])
  }

  /** Модель разговора (`<подключение>/<модель>`): выбранная или по умолчанию панели. */
  private modelValue(): string {
    return this.runtime.meta.model ?? openCodeOf(this.runtime).host.defaultModel() ?? ''
  }

  /**
   * Модель с вариантом усилия - ссылкой OpenCode; моделей нет - null. Вариант - только тот,
   * что модель объявила: чужой OpenCode не примет.
   */
  private modelRef() {
    const value = this.modelValue()
    const ref = modelRefOf(value)
    const { effort } = this.runtime.meta
    const fits = effort !== null && openCodeOf(this.runtime).host.efforts(value).includes(effort)

    return ref && { ...ref, ...(fits && { variant: effort }) }
  }
}

import type { EffortLevel } from '@shared/conversation'

import type { AcpAgent } from '../acp-agent'
import type { AcpConfigOption, AcpSessionSetup } from '../protocol/acp-types'
import { acpOf } from './acp-conversation'
import type { AcpSession } from './acp-session'

/** Настройка сессии по виду: модель, уровень размышления, режим. */
export const optionOf = (
  options: readonly AcpConfigOption[] | undefined,
  category: 'model' | 'thought_level' | 'mode',
): AcpConfigOption | undefined =>
  options?.find((option) => option.category === category) ??
  options?.find((option) => option.id === category)

/**
 * Куда уходят настройки: запрос к процессу агента, его сессия и её последние настройки. Одно на
 * вкладку панели (AcpSession) и на процесс прогона без вкладки (providers/acp).
 */
export type AcpSettingsTarget = {
  request: (method: string, params: unknown) => Promise<unknown>
  sessionId: string
  setup: AcpSessionSetup
  /** Агент ответил новыми настройками: меню панели или память прогона. */
  noteSetup: (setup: AcpSessionSetup) => void
}

/** Что поставить сессии: модель (пусто - агента), уровень IDE (нет - агента), id режима агента. */
export type AcpChoice = { model: string | null; effort: EffortLevel | null; mode: string }

/** Значение, которое агент примет: есть среди вариантов настройки. */
const offers = (option: AcpConfigOption, value: string): boolean =>
  !option.options || option.options.some((one) => one.value === value)

/** Поставить настройку сессии, если она другая; ответ агента обновляет меню. */
const setOption = async (target: AcpSettingsTarget, option: AcpConfigOption, value: string) => {
  if (option.currentValue === value || !offers(option, value)) return

  const reply = (await target.request('session/set_config_option', {
    sessionId: target.sessionId,
    configId: option.id,
    value,
  })) as AcpSessionSetup | null

  option.currentValue = value
  if (reply?.configOptions) target.noteSetup({ configOptions: reply.configOptions })
}

/**
 * Модель, усилие и режим - сессии агента, если поменялись (`session/set_config_option`; режим
 * без такой настройки - `session/set_mode`). Пустая модель - модель агента по умолчанию, её не
 * трогаем; модели, которой агент не предлагает (сценарий писали для другого провайдера), - тоже.
 */
export const applyChoice = async (
  target: AcpSettingsTarget,
  agent: Pick<AcpAgent, 'effortOf'>,
  choice: AcpChoice,
): Promise<void> => {
  const options = target.setup.configOptions
  const model = optionOf(options, 'model')
  const thought = optionOf(options, 'thought_level')
  const mode = optionOf(options, 'mode')

  if (model && choice.model) await setOption(target, model, choice.model)

  if (thought && choice.effort) {
    const value = agent.effortOf(choice.effort, thought)

    if (value) await setOption(target, thought, value)
  }

  if (mode) {
    await setOption(target, mode, choice.mode)
  } else if (target.setup.modes && target.setup.modes.currentModeId !== choice.mode) {
    await target.request('session/set_mode', {
      sessionId: target.sessionId,
      modeId: choice.mode,
    })
    target.setup.modes.currentModeId = choice.mode
  }
}

/** Настройки разговора вкладки - сессии агента перед ходом. */
export const applySettings = (session: AcpSession): Promise<void> => {
  const { meta } = session.runtime
  const { agent } = acpOf(session.runtime).host

  return applyChoice(
    {
      request: (method, params) => session.process.request(method, params),
      sessionId: session.sessionId,
      // Живое чтение: ответ агента посреди настройки заменяет настройки сессии.
      get setup() {
        return session.setup
      },
      noteSetup: (setup) => session.noteSetup(setup),
    },
    agent,
    { model: meta.model, effort: meta.effort, mode: agent.modeOf(meta.permissionMode) },
  )
}

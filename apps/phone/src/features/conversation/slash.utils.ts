import type { TFunction } from 'i18next'

import { EFFORTS } from '@agentic-workstation/remote-protocol/commands'
import type { SlashCommandWire } from '@agentic-workstation/remote-protocol/conversation-wire-types'
import type {
  ProviderCaps,
  ConversationWire,
} from '@agentic-workstation/remote-protocol/wire-types'

import { effortsOf } from '../../lib/options.utils'
import type { SlashOption } from '../../lib/slash.utils'
import { fastOffered } from './ConversationSettings/ConversationSettings.utils'

/** Значение «как в настройках» у /model и /effort - то же слово, что у поля окна IDE. */
export const DEFAULT_ARGUMENT = 'default'

/** Свои команды телефона и значения их аргумента. */
export type PhoneCommands = {
  commands: SlashCommandWire[]
  argumentSets: Record<string, SlashOption[]>
}

const own = (t: TFunction, name: string, argumentHint: string, agent: string) => ({
  name,
  hint: t(`composer.slash.hints.${name}`, { agent }),
  argumentHint,
  group: 'built-in' as const,
})

/**
 * Команды, которые выполняет сам телефон, а не CLI (как команды панели у поля окна): вопрос
 * сбоку и быстрый режим - у провайдера, который их умеет; модель и усилие - у всех, значениями
 * из каталога провайдера. Без провайдера (IDE ещё не прислала инвентарь) своих команд нет.
 */
export const phoneCommands = (
  t: TFunction,
  conversation: ConversationWire | null | undefined,
  provider: ProviderCaps | undefined,
): PhoneCommands => {
  if (!provider || !conversation) return { commands: [], argumentSets: {} }

  const agent = provider.label
  const model = conversation.model ?? conversation.activeModel
  const canFast = fastOffered(conversation, provider)
  const commands = [
    ...(provider.aside === false ? [] : [own(t, 'btw', '<question>', agent)]),
    ...(canFast ? [own(t, 'fast', '[on|off]', agent)] : []),
    own(t, 'model', '[model]', agent),
    own(t, 'effort', '[level]', agent),
  ]
  const argumentSets: Record<string, SlashOption[]> = {
    model: [
      { value: DEFAULT_ARGUMENT, hint: t('options.defaultModel') },
      ...provider.models.map((one) => ({ value: one.value, hint: one.label })),
    ],
    effort: [
      { value: DEFAULT_ARGUMENT, hint: t('options.defaultEffort') },
      ...effortsOf(provider, model)
        .filter((effort) => (EFFORTS as readonly string[]).includes(effort))
        .map((effort) => ({
          value: effort,
          hint: t(`effort.${effort}`, { defaultValue: effort }),
        })),
    ],
    ...(canFast && {
      fast: [
        { value: 'on', hint: t('composer.slash.fastOn') },
        { value: 'off', hint: t('composer.slash.fastOff') },
      ],
    }),
  }

  return { commands, argumentSets }
}

/**
 * Каталог поля: свои команды телефона, потом каталог IDE без их тёзок. Встроенную команду IDE без
 * пояснения телефон поясняет сам, если знает её (IDE пояснений встроенных не шлёт: они у окна в
 * его переводах).
 */
export const slashCatalog = (
  t: TFunction,
  phone: readonly SlashCommandWire[],
  ide: readonly SlashCommandWire[],
  agent: string,
): SlashCommandWire[] => {
  const taken = new Set(phone.map((command) => command.name))

  return [
    ...phone,
    ...ide
      .filter((command) => !taken.has(command.name))
      .map((command) =>
        command.hint || command.group !== 'built-in'
          ? command
          : {
              ...command,
              hint: t(`composer.slash.hints.${command.name}`, { agent, defaultValue: '' }),
            },
      ),
  ]
}

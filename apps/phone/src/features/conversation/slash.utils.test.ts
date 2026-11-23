import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { SlashCommandWire } from '@agentic-workstation/remote-protocol/conversation-wire-types'
import type {
  ProviderCaps,
  ConversationWire,
} from '@agentic-workstation/remote-protocol/wire-types'

import { slashCatalog, phoneCommands } from './slash.utils'

/** Перевод - ключом: тест видит, какой текст просили. */
const t = ((key: string, options?: { defaultValue?: string }) =>
  key.startsWith('composer.slash.hints.insights')
    ? (options?.defaultValue ?? key)
    : key) as TFunction

const provider: ProviderCaps = {
  id: 'claude',
  label: 'Claude Code',
  available: true,
  models: [
    { value: 'opus', label: 'Opus', description: '', fast: true },
    { value: 'sonnet', label: 'Sonnet', description: '', efforts: ['low', 'ultra-new'] },
  ],
  efforts: ['low', 'high'],
  permissionModes: [],
}

const conversation = (patch: Partial<ConversationWire> = {}): ConversationWire =>
  ({ id: 'c1', model: 'opus', activeModel: null, ...patch }) as ConversationWire

const ide = (name: string, group: SlashCommandWire['group'], hint = ''): SlashCommandWire => ({
  name,
  hint,
  argumentHint: '',
  group,
})

describe('свои команды телефона', () => {
  it('вопрос сбоку и быстрый режим - у того, кто умеет; модель и усилие - у всех', () => {
    const own = phoneCommands(t, conversation(), provider)

    expect(own.commands.map((one) => one.name)).toEqual(['btw', 'fast', 'model', 'effort'])
    expect(own.argumentSets['model']?.map((one) => one.value)).toEqual([
      'default',
      'opus',
      'sonnet',
    ])
    expect(own.argumentSets['fast']?.map((one) => one.value)).toEqual(['on', 'off'])

    const plain = phoneCommands(t, conversation({ model: 'sonnet' }), { ...provider, aside: false })

    expect(plain.commands.map((one) => one.name)).toEqual(['model', 'effort'])
    // Уровни модели, которые знает протокол; незнакомый новой IDE - мимо.
    expect(plain.argumentSets['effort']?.map((one) => one.value)).toEqual(['default', 'low'])
    expect(plain.argumentSets['fast']).toBeUndefined()
  })

  it('без провайдера или разговора своих команд нет', () => {
    expect(phoneCommands(t, conversation(), undefined).commands).toEqual([])
    expect(phoneCommands(t, null, provider).commands).toEqual([])
  })

  it('каталог: свои сверху, тёзки из IDE - мимо, встроенная без пояснения - пояснением телефона', () => {
    const own = phoneCommands(t, conversation(), provider).commands
    const catalog = slashCatalog(
      t,
      own,
      [
        ide('model', 'built-in'),
        ide('context', 'built-in'),
        ide('insights', 'built-in'),
        ide('deploy', 'project'),
      ],
      'Claude Code',
    )

    expect(catalog.map((one) => one.name)).toEqual([
      'btw',
      'fast',
      'model',
      'effort',
      'context',
      'insights',
      'deploy',
    ])
    expect(catalog[4]?.hint).toBe('composer.slash.hints.context')
    // Телефон этой встроенной не знает - пояснения нет, а не ключ перевода.
    expect(catalog[5]?.hint).toBe('')
    expect(catalog[6]?.hint).toBe('')
  })
})

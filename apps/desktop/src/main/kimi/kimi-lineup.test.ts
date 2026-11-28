import { it, expect, describe } from 'vitest'

import { kimiLineup } from './kimi-lineup'

const model = (value: string, displayName: string) => ({ value, displayName, description: '' })
const names = (models: readonly ReturnType<typeof model>[]) =>
  kimiLineup(models).map((item) => item.displayName)

describe('порядок моделей Kimi в меню', () => {
  it('новейшее поколение первым, внутри поколения - порядок Kimi', () => {
    // Порядок, в каком сервер подписки отдал модели 26.11.2026 (config.toml своей папки IDE).
    expect(
      names([
        model('kimi-code/kimi-for-coding', 'K2.8 Preview'),
        model('kimi-code/kimi-for-coding-highspeed', 'K2.7 Code Highspeed'),
        model('kimi-code/k3', 'K3'),
        model('kimi-code/k3-256k', 'K3-256k'),
        model('kimi-code/k3.1-pro', 'K3.1 Pro'),
        model('kimi-code/k3.1-pro-highspeed', 'K3.1 Pro Highspeed 2x Usage Cost'),
      ]),
    ).toEqual([
      'K3.1 Pro',
      'K3.1 Pro Highspeed 2x Usage Cost',
      'K3',
      'K3-256k',
      'K2.8 Preview',
      'K2.7 Code Highspeed',
    ])
  })

  it('поколение - по id, когда имя его не называет', () => {
    expect(
      names([model('kimi-code/k2.7', 'Kimi Coding'), model('kimi-code/k3', 'Kimi Next')]),
    ).toEqual(['Kimi Next', 'Kimi Coding'])
  })

  it('модель без номера - за остальными, в порядке Kimi', () => {
    expect(
      names([
        model('__kimi_env_model__', 'qwen3.8:latest'),
        model('kimi-code/k3', 'K3'),
        model('kimi-code/latest', 'Kimi Latest'),
        model('kimi-code/k3.1-pro', 'K3.1 Pro'),
      ]),
    ).toEqual(['K3.1 Pro', 'K3', 'qwen3.8:latest', 'Kimi Latest'])
  })
})

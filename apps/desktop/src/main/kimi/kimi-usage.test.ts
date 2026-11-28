import { it, expect, describe } from 'vitest'

import { liveToken, managedLogin } from './kimi-access'
import { usageFromKimi } from './kimi-usage'

const NOW = Date.parse('2026-11-27T16:20:00Z')

/** config.toml своей папки Kimi 2.7 - секции входа подписки как есть, ключи вымышлены. */
const CONFIG = [
  'default_model = "kimi-code/kimi-for-coding"',
  '',
  '[providers."managed:kimi-code"]',
  'type = "kimi"',
  'api_key = ""',
  'base_url = "https://api.kimi.ai/coding/v1"',
  '',
  '[providers."managed:kimi-code".oauth]',
  'storage = "file"',
  'key = "oauth/kimi-code-env-0e4f99c69cc27850"',
  'oauth_host = "https://auth.kimi.ai"',
  '',
  '[services.moonshot_search]',
  'base_url = "https://api.kimi.ai/coding/v1/search"',
].join('\n')

describe('вход Kimi из его папки', () => {
  it('сервер и файл токена - из секции подписки, а не из соседних служб', () => {
    expect(managedLogin(CONFIG)).toEqual({
      baseUrl: 'https://api.kimi.ai/coding/v1',
      tokenFile: 'kimi-code-env-0e4f99c69cc27850.json',
    })
  })

  it('чужое имя файла и не https - не вход', () => {
    expect(managedLogin(CONFIG.replace('oauth/kimi-code-env', 'oauth/../../etc'))).toBeNull()
    expect(managedLogin(CONFIG.replace('https://api.kimi.ai', 'http://api.kimi.ai'))).toBeNull()
    expect(managedLogin('')).toBeNull()
  })

  it('токен - только живой: обновляет его сам Kimi', () => {
    const file = (secondsLeft: number) =>
      JSON.stringify({ access_token: 'token', expires_at: NOW / 1000 + secondsLeft })

    expect(liveToken(file(600), NOW)).toBe('token')
    expect(liveToken(file(30), NOW)).toBe('')
    expect(liveToken('not json', NOW)).toBe('')
  })
})

describe('лимиты подписки Kimi', () => {
  it('пять часов и месяц - окнами панели в порядке Kimi; доли кода отдельным окном нет', () => {
    // Ответ `GET /usages` на подписке без недельного окна (замер 2026-11-27).
    const usage = usageFromKimi(
      {
        limits: [{ window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' } }],
        usages: {
          limit_5h: { used_ratio: 0.8635, reset_time: '2026-11-27T18:54:27Z' },
          limit_month_total: { used_ratio: '0.1775', reset_time: '2026-12-28T00:00:00Z' },
          limit_month_code: { used_ratio: 0.1741, reset_time: '2026-12-28T00:00:00Z' },
        },
      },
      NOW,
    )

    expect(usage.windows.map((window) => window.group)).toEqual(['session', 'monthly'])
    expect(usage.windows[0]?.percent).toBeCloseTo(86.35)
    expect(usage.windows[0]?.resetsAt).toBe(Date.parse('2026-11-27T18:54:27Z'))
    expect(usage.windows[1]?.percent).toBeCloseTo(17.75)
    expect(usage.extra).toBeNull()
    expect(usage.fetchedAt).toBe(NOW)
  })

  it('неделя - weekly; кошелёк пакетов с остатком - доплата', () => {
    const usage = usageFromKimi(
      {
        usages: { limit_7d: { used_ratio: 1 } },
        boosterWallet: { balance: { type: 'BOOSTER', amount: 5_000_000, amountLeft: 1_000_000 } },
      },
      NOW,
    )

    expect(usage.windows).toEqual([
      { group: 'weekly', model: '', percent: 100, resetsAt: null, severity: 'normal' },
    ])
    expect(usage.extra).toEqual({ percent: null })
  })

  it('пустой или чужой ответ - без окон', () => {
    expect(usageFromKimi(null, NOW).windows).toEqual([])
    expect(usageFromKimi({ usages: { limit_5h: { used_ratio: 'x' } } }, NOW).windows).toEqual([])
  })
})

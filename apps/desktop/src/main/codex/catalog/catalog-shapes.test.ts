import { it, expect, describe } from 'vitest'

import { modelsFromList, accountFromRead, historyFromList, usageFromLimits } from './catalog-shapes'

describe('каталог Codex в формы панели', () => {
  it('модели: свои уровни усилия, по умолчанию, скрытые не в меню', () => {
    const models = modelsFromList({
      data: [
        {
          id: 'm1',
          model: 'gpt-5.5-codex',
          displayName: 'GPT-5.5 Codex',
          description: 'Best for code',
          hidden: false,
          isDefault: true,
          supportedReasoningEfforts: [
            { reasoningEffort: 'low', description: '' },
            { reasoningEffort: 'xhigh', description: '' },
            { reasoningEffort: 'unknown', description: '' },
          ],
          defaultReasoningEffort: 'medium',
        },
        { id: 'secret', model: 'internal', displayName: 'X', hidden: true },
      ],
    })

    expect(models).toEqual([
      {
        value: 'gpt-5.5-codex',
        displayName: 'GPT-5.5 Codex',
        description: 'Best for code',
        efforts: ['low', 'xhigh'],
        defaultEffort: 'medium',
        isDefault: true,
      },
    ])
    expect(modelsFromList('nonsense')).toEqual([])
  })

  it('быстрый уровень модели: priority - есть, названы другие - нет, молчание - неизвестно', () => {
    const fast = modelsFromList({
      data: [
        { model: 'a', serviceTiers: [{ id: 'priority', name: 'Fast', description: '1.5x' }] },
        { model: 'b', serviceTiers: [{ id: 'flex', name: 'Flex', description: '' }] },
        { model: 'c', additionalSpeedTiers: ['fast'] },
        { model: 'd' },
      ],
    }).map((model) => model.fast)

    expect(fast).toEqual([true, false, true, undefined])
  })

  it('уровни усилия: явный пустой список - нет уровней, поля нет или уровни чужие - неизвестно', () => {
    const efforts = modelsFromList({
      data: [
        { model: 'a', supportedReasoningEfforts: [] },
        { model: 'b' },
        { model: 'c', supportedReasoningEfforts: [{ reasoningEffort: 'turbo' }] },
      ],
    }).map((model) => model.efforts)

    expect(efforts).toEqual([[], undefined, undefined])
  })

  it('аккаунт: вид входа, почта и тариф; не вошёл - null', () => {
    expect(
      accountFromRead({ account: { type: 'chatgpt', email: 'a@b.c', planType: 'pro' } }),
    ).toEqual({ kind: 'chatgpt', email: 'a@b.c', plan: 'pro' })
    expect(accountFromRead({ account: { type: 'apiKey' } })).toEqual({
      kind: 'apiKey',
      email: '',
      plan: '',
    })
    expect(accountFromRead({ account: null, requiresOpenaiAuth: true })).toBeNull()
  })

  it('лимиты: окна корзин в окна расхода, 5 часов и неделя словами панели', () => {
    const usage = usageFromLimits(
      {
        rateLimitsByLimitId: {
          codex: {
            primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 1_000 },
            secondary: { usedPercent: 90, windowDurationMins: 10_080, resetsAt: 2_000 },
          },
        },
      },
      5,
    )

    expect(usage).toEqual({
      windows: [
        { group: 'session', model: '', percent: 42, resetsAt: 1_000_000, severity: 'normal' },
        { group: 'weekly', model: '', percent: 90, resetsAt: 2_000_000, severity: 'warning' },
      ],
      extra: null,
      fetchedAt: 5,
    })
    expect(usageFromLimits({ rateLimits: { primary: { usedPercent: 100 } } }, 0).windows).toEqual([
      { group: 'primary', model: '', percent: 100, resetsAt: null, severity: 'error' },
    ])
  })

  it('история: имя или первое сообщение, субагенты и эфемерные - мимо, открытые помечены', () => {
    const history = historyFromList(
      {
        data: [
          { id: 't1', name: 'Fix login', preview: 'fix it', updatedAt: 10 },
          { id: 't2', name: null, preview: 'Add tests', updatedAt: 20 },
          { id: 't3', parentThreadId: 't1', preview: 'sub', updatedAt: 30 },
          { id: 't4', ephemeral: true, preview: 'side', updatedAt: 40 },
        ],
      },
      new Set(['t2']),
    )

    expect(history).toEqual([
      { sessionId: 't1', title: 'Fix login', updatedAt: 10_000, isOpen: false },
      { sessionId: 't2', title: 'Add tests', updatedAt: 20_000, isOpen: true },
    ])
  })
})

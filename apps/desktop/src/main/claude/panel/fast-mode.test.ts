import { it, expect, describe } from 'vitest'

import { fastModeShown, losesFastMode, modelHasFastMode } from '@shared/fast-mode'

import { fastReportOf } from './fast-mode'

const CATALOG = [
  { value: 'opus', displayName: 'Opus', description: '', fast: true, resolved: 'claude-opus-5-5' },
  { value: 'sonnet', displayName: 'Sonnet', description: '', fast: false },
  { value: 'haiku', displayName: 'Haiku', description: '' },
]

describe('быстрый режим: слова CLI', () => {
  // Поля - как в result из фикстуры потока (2.1.293): без просьбы CLI отвечает «не просили».
  it('читаются из init и result', () => {
    expect(
      fastReportOf({
        type: 'result',
        fast_mode_state: 'off',
        fast_mode_disabled_reason: 'sdk_opt_in_required',
      }),
    ).toEqual({ state: 'off', reason: 'sdk_opt_in_required' })
    expect(fastReportOf({ type: 'system', subtype: 'init', fast_mode_state: 'on' })).toEqual({
      state: 'on',
      reason: '',
    })
    expect(fastReportOf({ type: 'system', subtype: 'init' })).toBeNull()
    expect(fastReportOf({ type: 'result', fast_mode_state: 'turbo' })).toBeNull()
  })

  it('просьба и слова CLI читаются вместе', () => {
    const off = { state: 'off' as const, reason: 'sdk_opt_in_required' }

    expect(fastModeShown(false, { state: 'on', reason: '' })).toEqual({ kind: 'off' })
    expect(fastModeShown(true, undefined)).toEqual({ kind: 'waiting' })
    expect(fastModeShown(true, off)).toEqual({ kind: 'waiting' })
    expect(fastModeShown(true, { state: 'cooldown', reason: '' })).toEqual({ kind: 'cooldown' })
    expect(fastModeShown(true, { state: 'off', reason: 'extra_usage_disabled' })).toEqual({
      kind: 'unavailable',
      reason: 'extra_usage_disabled',
    })
  })
})

describe('быстрый режим: какая модель его умеет', () => {
  it('каталог решает по своей метке, в том числе для развёрнутого имени', () => {
    expect(modelHasFastMode(CATALOG, 'opus')).toBe(true)
    expect(modelHasFastMode(CATALOG, 'sonnet')).toBe(false)
    expect(modelHasFastMode(CATALOG, 'claude-opus-5-5[1m]')).toBe(true)
  })

  it('без каталога - правило CLI по имени', () => {
    expect(modelHasFastMode([], 'opus')).toBe(true)
    expect(modelHasFastMode([], 'claude-opus-4-8')).toBe(true)
    expect(modelHasFastMode([], 'claude-opus-4-7')).toBe(false)
    expect(modelHasFastMode([], 'haiku')).toBe(false)
  })

  it('модель без режима его снимает, а то, о чём каталог молчит, не трогается', () => {
    expect(losesFastMode(CATALOG, 'sonnet')).toBe(true)
    expect(losesFastMode(CATALOG, 'opus')).toBe(false)
    expect(losesFastMode(CATALOG, 'haiku')).toBe(false)
    expect(losesFastMode([], 'haiku')).toBe(true)
    expect(losesFastMode([], null)).toBe(false)
  })
})

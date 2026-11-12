import { it, expect, describe } from 'vitest'

import { HOUR_MS, MINUTE_MS } from '@shared/time-units'

import { forAgent, carryOnWords, parseCarryOn } from './carry-on-words'
import {
  isDue,
  owedFor,
  retryAt,
  limitWait,
  shownPlan,
  mergedOwed,
  limitAcross,
  helpersAtWork,
} from './carry-ons'

const NOW = 1_000_000_000

describe('продолжение после лимита', () => {
  it('в момент сброса плюс 30 секунд', () => {
    const wait = limitWait(NOW, NOW + HOUR_MS, null, 'a')

    expect(wait).toMatchObject({ reason: 'limit', notBefore: NOW + HOUR_MS + 30_000, guess: false })
    expect(wait?.account).toBe('a')
  })

  it('сброс не назван - через 15 минут, с пометкой «пробую»', () => {
    expect(limitWait(NOW, null, null, 'a')).toMatchObject({
      notBefore: NOW + 15 * MINUTE_MS + 30_000,
      guess: true,
    })
  })

  it('сброс почти сейчас - не раньше минуты', () => {
    expect(retryAt(NOW + 1000, NOW)).toBe(NOW + MINUTE_MS)
  })

  it('дольше шести часов не ждём', () => {
    expect(limitWait(NOW, NOW + 6 * HOUR_MS + 1, null, 'a')).toBeNull()
    expect(limitWait(NOW, NOW + 6 * HOUR_MS, null, 'a')).not.toBeNull()
  })

  it('три своих продолжения подряд, отказанные лимитом, - вкладка остаётся человеку', () => {
    const first = limitWait(NOW, null, null, 'a')
    const second = limitWait(NOW, null, first, 'a')
    const third = limitWait(NOW, null, second, 'a')

    expect([first?.tries, second?.tries, third?.tries]).toEqual([0, 1, 2])
    expect(limitWait(NOW, null, third, 'a')).toBeNull()
  })

  it('переезд на аккаунт без отказа - сразу, с близким отказом - к его сбросу, с далёким - никогда', () => {
    const owed = owedFor('limit', { notBefore: NOW + HOUR_MS, account: 'a', guess: true })

    expect(limitAcross(owed, 'b', null, NOW)).toMatchObject({
      notBefore: null,
      account: 'b',
      moved: true,
      guess: false,
    })
    expect(limitAcross(owed, 'b', NOW + HOUR_MS, NOW)?.notBefore).toBe(NOW + HOUR_MS + 30_000)
    expect(limitAcross(owed, 'b', NOW + 7 * HOUR_MS, NOW)).toBeNull()
  })
})

describe('причины складываются', () => {
  const limit = owedFor('limit', { notBefore: NOW + HOUR_MS })

  it('смена аккаунта покрывает всё', () => {
    expect(mergedOwed(limit, owedFor('accountSwitch')).reason).toBe('accountSwitch')
    expect(mergedOwed(owedFor('accountSwitch'), limit).reason).toBe('accountSwitch')
  })

  it('перезапуск поверх лимита не торопит ожидание, но слова скажут о фоне', () => {
    expect(mergedOwed(limit, owedFor('restart'))).toEqual({ ...limit, helpersLost: true })
  })

  it('новое ожидание лимита помнит потерянных агентов и «нет» человека', () => {
    const old = { ...limit, helpersLost: true, silent: true }
    const next = owedFor('limit', { notBefore: NOW + 2 * HOUR_MS })

    expect(mergedOwed(old, next)).toMatchObject({ helpersLost: true, silent: true })
  })
})

describe('план и сроки', () => {
  it('план виден, пока момент впереди и человек не отказался', () => {
    const owed = owedFor('limit', { notBefore: NOW + HOUR_MS, guess: true })

    expect(shownPlan(owed, NOW)).toEqual({ until: NOW + HOUR_MS, guess: true })
    expect(shownPlan({ ...owed, silent: true }, NOW)).toBeUndefined()
    expect(shownPlan(owed, NOW + 2 * HOUR_MS)).toBeUndefined()
    expect(shownPlan(owedFor('accountSwitch'), NOW)).toBeUndefined()
  })

  it('без момента долг наступил сразу', () => {
    expect(isDue(owedFor('accountSwitch'), NOW)).toBe(true)
    expect(isDue(owedFor('limit', { notBefore: NOW + 1 }), NOW)).toBe(false)
  })

  it('фоновые агенты, о которых полчаса ни слова, - не работа', () => {
    expect(helpersAtWork(true, NOW - MINUTE_MS, NOW)).toBe(true)
    expect(helpersAtWork(true, NOW - 31 * MINUTE_MS, NOW)).toBe(false)
    expect(helpersAtWork(true, 0, NOW)).toBe(false)
    expect(helpersAtWork(false, NOW, NOW)).toBe(false)
  })
})

describe('слова панели', () => {
  it('лимит и переезд сказаны раздельно, потерянный фон - добавкой', () => {
    const limit = owedFor('limit')

    expect(carryOnWords(limit)).toContain('has reset')
    expect(carryOnWords({ ...limit, moved: true })).toContain('moved to another account')
    expect(carryOnWords({ ...limit, helpersLost: true })).toContain('did not survive a restart')
  })

  it('тег несёт причину туда и обратно, незнакомая причина - unknown', () => {
    const tagged = forAgent('accountSwitch', 'Carry on.')

    expect(tagged).toBe('<panel-carry-on reason="accountSwitch">Carry on.</panel-carry-on>')
    expect(parseCarryOn(tagged)).toEqual({ reason: 'accountSwitch', words: 'Carry on.' })
    expect(parseCarryOn('<panel-carry-on reason="later">x</panel-carry-on>')?.reason).toBe(
      'unknown',
    )
    expect(parseCarryOn('carry on')).toBeNull()
  })
})

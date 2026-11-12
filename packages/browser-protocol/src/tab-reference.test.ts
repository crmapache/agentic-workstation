import { it, expect, describe } from 'vitest'

import { sameTabTitle, parseTabReference, formatTabReference } from './tab-reference'

describe('ссылка на вкладку', () => {
  it('пишется с меткой запуска и заголовком и читается целиком', () => {
    const text = formatTabReference(
      { profileKey: 'k3x9ab12', tabId: 1834, launch: 'q7w2e9' },
      ' Inbox  (3) - Gmail ',
    )

    expect(text).toBe('chrome-tab:k3x9ab12/1834@q7w2e9 "Inbox (3) - Gmail"')
    expect(parseTabReference(text)).toEqual({
      profileKey: 'k3x9ab12',
      tabId: 1834,
      launch: 'q7w2e9',
      title: 'Inbox (3) - Gmail',
    })
  })

  it('без заголовка и метки - только ссылка', () => {
    expect(formatTabReference({ profileKey: 'abcd', tabId: 5 })).toBe('chrome-tab:abcd/5')
    expect(parseTabReference('chrome-tab:abcd/5')).toEqual({
      profileKey: 'abcd',
      tabId: 5,
      launch: null,
      title: null,
    })
  })

  it('читает ссылку без приставки и в обёртках', () => {
    expect(parseTabReference('abcd1234/42')).toMatchObject({ profileKey: 'abcd1234', tabId: 42 })
    expect(parseTabReference('`chrome-tab:abcd1234/42@zz99`')).toMatchObject({
      profileKey: 'abcd1234',
      tabId: 42,
      launch: 'zz99',
    })
    expect(parseTabReference('"chrome-tab:abcd1234/42",')).toMatchObject({
      profileKey: 'abcd1234',
      tabId: 42,
    })
    expect(parseTabReference('chrome-tab:abcd1234/42 «Почта»')).toMatchObject({ title: 'Почта' })
  })

  it('не принимает чужое', () => {
    expect(parseTabReference('')).toBeNull()
    expect(parseTabReference('42')).toBeNull()
    expect(parseTabReference('chrome-tab:AB/1')).toBeNull()
    expect(parseTabReference('chrome-tab:abcd1234/x')).toBeNull()
    expect(parseTabReference('chrome-tab:abcd1234/1@X')).toBeNull()
    expect(parseTabReference('https://example.com/abcd/1')).toBeNull()
  })
})

describe('тот ли заголовок', () => {
  it('счётчики, знаки и регистр не мешают; часть заголовка - тоже он', () => {
    expect(sameTabTitle('Inbox (3) - Gmail', 'inbox (12) | gmail')).toBe(true)
    expect(sameTabTitle('Pull requests', 'Pull requests · owner/repo')).toBe(true)
  })

  it('другая страница - не он', () => {
    expect(sameTabTitle('Inbox - Gmail', 'Bank of Example - Sign in')).toBe(false)
    expect(sameTabTitle('', 'Something')).toBe(false)
  })
})

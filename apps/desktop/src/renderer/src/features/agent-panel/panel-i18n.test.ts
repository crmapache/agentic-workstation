import { it, expect, describe } from 'vitest'

import codexEn from '../../locales/en.codex.json'
import en from '../../locales/en.json'
import { panelI18n, withOverrides } from './panel-i18n'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Ключи-листья: путь через точку. */
const leaves = (value: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, child]) =>
    isRecord(child) ? leaves(child, `${prefix}${key}.`) : [`${prefix}${key}`],
  )

describe('переводы панели провайдера', () => {
  it('строки Codex - только поверх существующих ключей', () => {
    const known = new Set(leaves(en))

    expect(leaves(codexEn).filter((key) => !known.has(key))).toEqual([])
  })

  it('поверх общих ложится своё, общие не меняются', () => {
    const base = { a: { b: 'x', c: 'y' }, d: 'z' }

    expect(withOverrides(base, { a: { b: 'own' } })).toEqual({ a: { b: 'own', c: 'y' }, d: 'z' })
    expect(base.a.b).toBe('x')
  })

  it('панель Codex говорит своим именем и своими режимами', () => {
    const t = panelI18n('codex').t

    expect(t('agentPanel.welcome.title')).toBe('Ask Codex about this project')
    expect(t('agentPanel.cliMissingTitle')).toBe('Codex is not installed')
    expect(t('agentPanel.modes.labels.acceptEdits')).toBe('Auto')
    expect(t('agentPanel.composer.placeholder', { agent: 'X' })).toContain('Ask X')
  })
})

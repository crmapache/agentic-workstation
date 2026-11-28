import { it, expect, describe } from 'vitest'

import type { Conversation } from '@shared/conversation'

import { sparesToDrop } from './spare-tabs.utils'

const tab = (id: string, projectPath: string, spare?: boolean): Conversation =>
  ({ id, projectPath, ...(spare && { spare: true }) }) as Conversation

const noDrafts = () => false

describe('запасные вкладки', () => {
  it('рядом встал разговор агента - запасная уходит, даже первая на полосе', () => {
    const tabs = [tab('spare', '/arena', true), tab('rifle', '/arena')]

    expect(sparesToDrop(tabs, noDrafts)).toEqual(['spare'])
  })

  it('единственная вкладка проекта - остаётся: человек смотрит на панель без разговоров', () => {
    expect(sparesToDrop([tab('spare', '/arena', true), tab('a', '/other')], noDrafts)).toEqual([])
  })

  it('с черновиком - остаётся: набранное не теряется', () => {
    const tabs = [tab('spare', '/arena', true), tab('rifle', '/arena')]

    expect(sparesToDrop(tabs, (id) => id === 'spare')).toEqual([])
  })

  it('две запасные без разговора рядом - обе остаются', () => {
    expect(sparesToDrop([tab('a', '/arena', true), tab('b', '/arena', true)], noDrafts)).toEqual([])
  })
})

import { it, expect, describe } from 'vitest'

import { mergedValues, declaredValues } from './ExtensionSurface.utils'

describe('значения полей вида расширения', () => {
  it('собирает объявленные значения по всему дереву', () => {
    expect(
      declaredValues({
        type: 'section',
        title: 'Form',
        actions: [{ type: 'switch', name: 'on', label: 'On', checked: true }],
        children: [
          { type: 'textField', name: 'name', label: 'Name', value: 'Max' },
          { type: 'row', children: [{ type: 'select', name: 'kind', label: 'Kind', options: [] }] },
        ],
      }),
    ).toEqual({ on: true, name: 'Max', kind: '' })
  })

  it('держит набранное человеком, пока расширение не поменяло поле само', () => {
    const before = { name: '', query: '' }
    const typed = { name: 'Ma', query: 'abc' }

    expect(mergedValues(typed, before, { name: '', query: '' })).toEqual({
      name: 'Ma',
      query: 'abc',
    })
    expect(mergedValues(typed, before, { name: '', query: 'reset' })).toEqual({
      name: 'Ma',
      query: 'reset',
    })
  })
})

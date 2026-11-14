import { it, expect, describe } from 'vitest'

import { withInProject } from './connector-in-project'

const said = { instructions: 'use staging', browserProfile: 'Improving' }
const empty = { instructions: '', browserProfile: null }

describe('withInProject', () => {
  it('новое - записью, то же самое и пустое без записи - без изменений', () => {
    expect(withInProject({}, '/p/a', said)).toEqual({ '/p/a': said })
    expect(withInProject({ '/p/a': said }, '/p/a', { ...said })).toBeNull()
    expect(withInProject({}, '/p/a', empty)).toBeNull()
  })

  it('пустое стирает запись проекта, чужие проекты не трогает', () => {
    const other = { instructions: 'x', browserProfile: null }

    expect(withInProject({ '/p/a': said, '/p/b': other }, '/p/a', empty)).toEqual({
      '/p/b': other,
    })
    expect(withInProject({ '/p/a': said }, '/p/a', { ...said, browserProfile: null })).toEqual({
      '/p/a': { instructions: 'use staging', browserProfile: null },
    })
  })
})

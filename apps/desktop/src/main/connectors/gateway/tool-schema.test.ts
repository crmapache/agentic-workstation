import { it, expect, describe } from 'vitest'

import { portableSchema } from './tool-schema'

describe('схема входа инструмента для любого провайдера', () => {
  it('список без items получает items: {}, вложенный - тоже', () => {
    expect(
      portableSchema({
        type: 'object',
        properties: {
          args: { type: 'array', description: 'x' },
          deep: { type: 'object', properties: { list: { type: ['array', 'null'] } } },
          ok: { type: 'array', items: { type: 'string' } },
        },
      }),
    ).toEqual({
      type: 'object',
      properties: {
        args: { type: 'array', description: 'x', items: {} },
        deep: { type: 'object', properties: { list: { type: ['array', 'null'], items: {} } } },
        ok: { type: 'array', items: { type: 'string' } },
      },
    })
  })

  it('остальное не трогается', () => {
    const schema = { type: 'object', properties: { text: { type: 'string', enum: ['a', 'b'] } } }

    expect(portableSchema(schema)).toEqual(schema)
  })
})

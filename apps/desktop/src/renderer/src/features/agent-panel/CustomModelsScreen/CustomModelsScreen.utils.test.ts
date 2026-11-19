import { it, expect, describe } from 'vitest'

import { modelNameProblem } from './CustomModelsScreen.utils'

describe('имя своей модели', () => {
  it('годное для аргумента запуска - да, с пробелом, кавычкой, запятой или дефисом - нет', () => {
    expect(modelNameProblem('openrouter/anthropic/claude-x', [])).toBeNull()
    expect(modelNameProblem('two words', [])).toBe('invalid')
    expect(modelNameProblem('a"b', [])).toBe('invalid')
    expect(modelNameProblem('a,b', [])).toBe('invalid')
    expect(modelNameProblem('--help', [])).toBe('invalid')
  })

  it('уже в списке - не добавить второй раз; пусто - не ошибка', () => {
    expect(modelNameProblem('proxy/opus', ['proxy/opus'])).toBe('duplicate')
    expect(modelNameProblem('', [])).toBeNull()
  })
})

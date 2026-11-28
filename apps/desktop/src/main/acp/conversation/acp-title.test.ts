import { it, expect, describe } from 'vitest'

import { titleOf, chatContent } from '../../kimi/kimi-title'
import type { StoredPanel } from '../../agents/panel/panel-state'
import { titlePrompts, withoutPromptTitles } from './acp-title'

const LONG =
  'Я хочу, чтобы ты разработал совершенно новые модели персонажей, оружия, выстрелов и турелей с текстурами, плюс красивые анимации для них (все нужные варианты, и те, которых не хватало), и чтобы всё бы'

describe('имя разговора у агента ACP', () => {
  it('первое сообщение - само по себе: догадка-имя и есть его начало', () => {
    expect(
      titlePrompts('Сделай новую модель…', 'Сделай новую модель снайперской винтовки'),
    ).toEqual(['Сделай новую модель снайперской винтовки'])
  })

  it('прежняя догадка - первым сообщением: «Продолжай» один разговор не назовёт', () => {
    expect(titlePrompts(LONG, 'Продолжай, но только винтовку')).toEqual([
      LONG,
      'Продолжай, но только винтовку',
    ])
  })

  it('команда «/» и короткое - не называют', () => {
    expect(titlePrompts('', '/compact')).toBeNull()
    expect(titlePrompts(LONG, 'Продолжай')).toBeNull()
  })

  it('начало сообщения, принятое раньше за имя от модели, снова догадка; настоящие имена целы', () => {
    const stored = {
      conversations: [
        { id: 'a', title: LONG, titleSource: 'llm' },
        { id: 'b', title: 'Rifle model for the arena', titleSource: 'llm' },
        { id: 'c', title: LONG, titleSource: 'user' },
      ],
    } as unknown as StoredPanel

    expect(withoutPromptTitles(stored).conversations.map((one) => one.titleSource)).toEqual([
      'heuristic',
      'llm',
      'user',
    ])
  })
})

describe('инструмент имён Kimi', () => {
  it('разговор - строками `user:`, каждое сообщение до 400 знаков', () => {
    const content = chatContent([LONG.repeat(3), 'Продолжай, но только винтовку'])

    expect(content.split('\n').map((line) => line.length)).toEqual([406, 35])
    expect(content.startsWith('user: Я хочу')).toBe(true)
  })

  it('имя - одной строкой; без имени - null', () => {
    expect(titleOf({ title: '  Rifle model\nfor the arena ' })).toBe('Rifle model for the arena')
    expect(titleOf({ title: '' })).toBeNull()
    expect(titleOf(null)).toBeNull()
  })
})

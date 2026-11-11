import { it, expect, describe } from 'vitest'

import { projectTone, projectInitials } from './project-avatar.utils'

describe('projectInitials', () => {
  it('первые буквы двух слов, любые разделители и camelCase', () => {
    expect(projectInitials('agentic-workstation')).toBe('AW')
    expect(projectInitials('smooth-stream-text')).toBe('SS')
    expect(projectInitials('roasRadar')).toBe('RR')
    expect(projectInitials('gymapp_web')).toBe('GW')
  })

  it('одно слово - две первые буквы, пустое имя - знак вопроса', () => {
    expect(projectInitials('snakein')).toBe('SN')
    expect(projectInitials('x')).toBe('X')
    expect(projectInitials('---')).toBe('?')
  })
})

describe('projectTone', () => {
  it('один проект - всегда один цвет, в пределах палитры', () => {
    expect(projectTone('agentic-workstation')).toBe(projectTone('agentic-workstation'))
    expect(projectTone('roas-radar')).toBeGreaterThanOrEqual(0)
    expect(projectTone('roas-radar')).toBeLessThan(6)
  })
})

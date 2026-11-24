import { it, expect, describe } from 'vitest'

import { eventFormatOf } from './event-format'

describe('звонок или лично', () => {
  it('ссылка на звонок - звонок, что бы ни сказал ИИ', () => {
    expect(eventFormatOf('https://meet.google.com/a-b-c', 'Office, 3rd floor')).toBe('call')
    expect(eventFormatOf('https://zoom.us/j/1', null, 'in-person')).toBe('call')
  })

  it('слово ИИ - раньше места', () => {
    expect(eventFormatOf(null, 'Room 4.2', 'call')).toBe('call')
    expect(eventFormatOf(null, null, 'in-person')).toBe('in-person')
  })

  it('адрес и комната - лично', () => {
    expect(eventFormatOf(null, 'Banco Nacional, City Mall Alajuela')).toBe('in-person')
    expect(eventFormatOf(null, 'Calle Mayor 5, Madrid')).toBe('in-person')
    expect(eventFormatOf(null, 'Переговорная «Байкал»')).toBe('in-person')
    expect(eventFormatOf(null, 'https://maps.app.goo.gl/abc')).toBe('in-person')
    expect(eventFormatOf(null, 'https://www.google.com/maps/place/x')).toBe('in-person')
  })

  it('сервис звонков словом, онлайн и телефон - звонок', () => {
    expect(eventFormatOf(null, 'Microsoft Teams Meeting')).toBe('call')
    expect(eventFormatOf(null, 'Zoom')).toBe('call')
    expect(eventFormatOf(null, 'Online')).toBe('call')
    expect(eventFormatOf(null, 'Videollamada')).toBe('call')
    expect(eventFormatOf(null, 'Созвон в телеграме')).toBe('call')
    expect(eventFormatOf(null, '+1 (555) 010-0000')).toBe('call')
  })

  it('ни места, ни ссылки, или место - ссылка не на карту - не сказано', () => {
    expect(eventFormatOf(null, null)).toBe('unknown')
    expect(eventFormatOf(null, '  ')).toBe('unknown')
    expect(eventFormatOf(null, 'https://calendly.com/someone')).toBe('unknown')
  })
})

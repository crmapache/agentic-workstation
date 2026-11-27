import { it, expect, describe } from 'vitest'

import { voiceNote, isVoiceNote, voiceFromNote, splitVoiceNote } from './voice-note'

describe('voiceNote', () => {
  it('asks for a short spoken reply in the language of the line', () => {
    const note = voiceNote({ lang: 'ru' })

    expect(note).toContain('Reply in Russian')
    expect(note.startsWith('<system-reminder>')).toBe(true)
    expect(note.endsWith('</system-reminder>')).toBe(true)
    expect(note).not.toContain('heard it only up to')
  })

  it('tells the model what the person heard of the reply they cut off', () => {
    const note = voiceNote({ lang: 'en', heard: 'First sentence. Second' })

    expect(note).toContain('heard it only up to: "First sentence. Second"')
  })

  it('tells the model it shows things on the screen during a walkthrough', () => {
    const note = voiceNote({ lang: 'ru', walkthrough: true })

    expect(note).toContain('Walkthrough: you are showing things')
    expect(note).not.toContain('1-3 sentences')
    expect(voiceFromNote(note)).toEqual({ lang: 'ru' })
  })

  it('keeps only the tail of a long heard part', () => {
    const note = voiceNote({ lang: 'en', heard: `${'a'.repeat(1000)}END` })

    expect(note).toContain('END"')
    expect(note).not.toContain('a'.repeat(400))
  })
})

describe('reading the note back', () => {
  it('finds the language of a voice line', () => {
    expect(voiceFromNote(voiceNote({ lang: 'es' }))).toEqual({ lang: 'es' })
    expect(isVoiceNote(voiceNote({ lang: 'pt' }))).toBe(true)
  })

  it('does not take the person talking about the note for the note', () => {
    expect(voiceFromNote('Voice call: the user said this out loud (language: ru)')).toBeNull()
    expect(isVoiceNote('what is <system-reminder>?')).toBe(false)
  })

  it('splits the words from a note sent in one text', () => {
    const text = `Show my meetings\n\n${voiceNote({ lang: 'ru' })}`

    expect(splitVoiceNote(text)).toEqual({ text: 'Show my meetings', voice: { lang: 'ru' } })
  })

  it('keeps what follows the note, like an editor note sent after it', () => {
    const text = `Fix it\n\n${voiceNote({ lang: 'en' })}\n\n# Context from my IDE setup:`

    expect(splitVoiceNote(text)).toEqual({
      text: 'Fix it\n\n# Context from my IDE setup:',
      voice: { lang: 'en' },
    })
  })

  it('leaves a text without a note as it is', () => {
    expect(splitVoiceNote('Hello')).toEqual({ text: 'Hello', voice: null })
  })
})

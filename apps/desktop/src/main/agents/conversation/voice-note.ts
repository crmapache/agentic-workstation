import type { VoiceMark, VoiceLanguage, VoiceOutgoing } from '@shared/voice'
import { isVoiceLanguage } from '@shared/voice'

/**
 * Скрытая пометка к реплике, сказанной голосом (ADR 0104): как говорить, пока идёт звонок.
 * Едет к каждой голосовой реплике, а не в системный промпт: CLI читает промпт только при
 * запуске, а пометка снимается сама - звонок кончился, пометок нет, и агент снова пишет
 * подробно. Одна форма у всех провайдеров; тег <system-reminder> лента, имя вкладки и поиск
 * Claude уже вырезают из слов человека.
 */

const LANGUAGE_NAMES: Record<VoiceLanguage, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  hi: 'Hindi',
  ru: 'Russian',
  pt: 'Portuguese',
  ja: 'Japanese',
  it: 'Italian',
  nl: 'Dutch',
}

const OPENING = '<system-reminder>\nVoice call:'
const CLOSING = '</system-reminder>'

/** Сколько прозвучавшего ответа пересказать модели: хвост длиннее - лишние токены. */
const HEARD_MAX = 400

/**
 * Текст пометки. heard - что человек успел услышать из прошлого ответа, когда перебил его:
 * без этого модель считала бы, что он слышал всё. walkthrough - реплика показа на экране
 * (ADR 0134): говорить там приходится больше, чем 1-3 фразы, а как показывать - в пояснении
 * сервера Walkthrough.
 */
export const voiceNote = ({ lang, heard, walkthrough }: VoiceOutgoing): string => {
  const name = LANGUAGE_NAMES[lang]
  const lines = [
    `${OPENING} the user said this out loud (language: ${lang}) and hears your reply read aloud.`,
    `- Reply in ${name}, whatever language the rest of this chat is in.`,
    walkthrough
      ? "- Walkthrough: you are showing things on the user's screen. Follow the rules of the walkthrough server: mark with its tools, look and act with Computer Use, speak in short plain sentences, no Markdown."
      : '- Keep it short: 1-3 sentences of plain spoken language, no Markdown.',
    '- Do not read out code, file paths, tables or links: put them in the chat and say that the details are in the chat.',
    '- Before long work, say in one short sentence what you are about to do.',
    '- If the words look like a speech recognition mistake, ask again instead of guessing.',
  ]

  if (heard?.trim()) {
    const tail = heard.trim().slice(-HEARD_MAX)

    lines.push(`- The user interrupted your previous reply and heard it only up to: "${tail}"`)
  }

  return [...lines, CLOSING].join('\n')
}

const LANGUAGE =
  /^<system-reminder>\nVoice call: the user said this out loud \(language: ([a-z]{2})\)/

/** Пометка ли это - блок целиком, а не слова человека о ней. */
export const isVoiceNote = (text: string): boolean => text.startsWith(OPENING)

/** Пометка обратно в отметку голосовой реплики - для разговора из журнала. */
export const voiceFromNote = (text: string): VoiceMark | null => {
  const lang = LANGUAGE.exec(text)?.[1]

  return isVoiceLanguage(lang) ? { lang } : null
}

/**
 * Слова человека и пометка из одного текста - у провайдера, которому сообщение уходит одним
 * текстом: пометка стоит последней, через пустую строку.
 */
export const splitVoiceNote = (text: string): { text: string; voice: VoiceMark | null } => {
  const at = text.startsWith(OPENING) ? 0 : text.lastIndexOf(`\n\n${OPENING}`)

  if (at < 0) return { text, voice: null }

  const note = text.slice(at).trimStart()
  const end = note.indexOf(CLOSING)
  const rest = end < 0 ? '' : note.slice(end + CLOSING.length).trim()
  const before = text.slice(0, at).trimEnd()

  return { text: [before, rest].filter(Boolean).join('\n\n'), voice: voiceFromNote(note) }
}

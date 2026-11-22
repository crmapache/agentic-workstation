import type { VoiceLanguage } from '@shared/voice'
import { VOICE_LANGUAGES } from '@shared/voice'

/**
 * Язык текста целиком - чтобы голос озвучки совпадал с тем, что он читает (ADR 0104, 0106). Ярлык
 * языка от Flux STT на смешанной речи врёт: русская реплика «Ok, a теперь посмотри…» пришла с
 * языком pt, и португальский голос читал русский ответ. Поэтому язык решает сам текст: письмо
 * (кириллица, деванагари, кана) - сразу, латиница - по частым служебным словам. Слова в кавычках
 * («hmm poquito») - цитата, язык ответа они не меняют, пока вне кавычек есть что считать.
 */

type LatinLanguage = 'en' | 'es' | 'pt' | 'fr' | 'de' | 'it' | 'nl'

/**
 * Частые служебные слова латинских языков. Общее у нескольких языков («de», «que», «a») делит
 * голос между ними, поэтому решают слова, которых у соседей нет.
 */
const MARKERS: Record<LatinLanguage, string> = {
  en: "the and is are was were you your i i'm it's it this that with for of to in on at have has be not what there here will would can just from they we he she my me do does did about all any some yes a an or if so but how why when where which who",
  es: 'el la los las que de y en un una es por con para no se lo del al como más pero ya o este esta sí porque muy sin sobre también me hay donde cuando está están tengo tiene hola gracias qué cómo mi tu eso ahora aquí bien hacer a',
  pt: 'o a os as que de e do da dos das em um uma é não para com por no na se mais mas como ao foi ele ela seu sua isso isto está estão você obrigado obrigada olá tem ter muito também aqui agora então onde quando já eu meu minha',
  fr: "le la les de des du et un une est en que qui pas ne pour dans sur avec ce cette il elle je tu nous vous au aux mais ou plus sont été très bien merci bonjour oui c'est j'ai être avoir",
  de: 'der die das und ist nicht ein eine zu den dem mit von sich auf für ich du sie es wir ihr auch aber wie noch nur oder wenn dann sind war haben hat kann ja nein danke hallo bitte mehr schon jetzt hier',
  it: 'il lo la gli le di e è che un una per non con del della dei delle da in sono ma come anche più questo questa ho hai ha io tu lui lei noi voi loro grazie ciao perché molto ancora sì a',
  nl: 'de het een en is van dat die niet ik je zijn op te met voor er maar om aan ook als bij nog wat wel geen naar hoe dan dit jij hij zij wij ze heb hebt heeft kan dank hallo ja nee',
}

/** Слово - на каких латинских языках оно служебное. */
const MARKED = new Map<string, LatinLanguage[]>()

for (const [language, words] of Object.entries(MARKERS) as Array<[LatinLanguage, string]>) {
  for (const word of words.split(' ')) MARKED.set(word, [...(MARKED.get(word) ?? []), language])
}

/** Буквы с особыми знаками - подсказка вполсилы: «ñ» бывает только у испанского. */
const LETTERS: Array<[RegExp, LatinLanguage[]]> = [
  [/[ñ¿¡]/u, ['es']],
  [/[ãõ]/u, ['pt']],
  [/ç/u, ['pt', 'fr']],
  [/[ßäö]/u, ['de']],
  [/[œæêîûëï]/u, ['fr']],
]

const LETTER_WEIGHT = 0.5

const CYRILLIC = /\p{Script=Cyrillic}/u
const DEVANAGARI = /\p{Script=Devanagari}/u
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu
const LATIN = /\p{Script=Latin}/u

/** Языки, которые узнаются по письму: одного слова хватает. */
const BY_SCRIPT: ReadonlySet<VoiceLanguage> = new Set(['ru', 'hi', 'ja'])

/** Сколько очков латинского языка нужно, чтобы решить без продолжения текста. */
const SURE_SCORE = 2

/** Цитата в кавычках: «…», “…”, „…“ и "…" в одной строке. */
const QUOTED = /«[^»]*»|“[^”]*”|„[^“”]*[“”]|"[^"\n]*"/g

/** Слова без регистра и знаков вокруг; апостроф внутри остаётся («i'm», «c'est»). */
const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/’/g, "'")
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)

const add = (
  scores: Map<VoiceLanguage, number>,
  languages: readonly VoiceLanguage[],
  weight = 1,
) => {
  for (const language of languages) {
    scores.set(language, (scores.get(language) ?? 0) + weight / languages.length)
  }
}

/** Очки языков по словам текста: письмо - слово за очко, латиница - служебные слова и буквы. */
const score = (text: string): Map<VoiceLanguage, number> => {
  const scores = new Map<VoiceLanguage, number>()

  for (const word of wordsOf(text)) {
    if (CYRILLIC.test(word)) add(scores, ['ru'])
    else if (DEVANAGARI.test(word)) add(scores, ['hi'])
    else if (word.match(JAPANESE)) {
      // Японский пишется без пробелов: слово здесь - кусок фразы, в среднем два знака на слово.
      add(scores, ['ja'], Math.ceil((word.match(JAPANESE)?.length ?? 0) / 2))
    } else if (LATIN.test(word)) {
      const marked = MARKED.get(word)

      if (marked) add(scores, marked)

      for (const [letters, languages] of LETTERS) {
        if (letters.test(word)) add(scores, languages, LETTER_WEIGHT)
      }
    }
  }

  return scores
}

const total = (scores: Map<VoiceLanguage, number>): number =>
  [...scores.values()].reduce((sum, value) => sum + value, 0)

export type TextLanguage = {
  /** Язык с наибольшим счётом; ни одной улики - null. Ничья - тот, что раньше в списке IDE. */
  language: VoiceLanguage | null
  /** Улик хватает, чтобы решить сейчас, не дожидаясь продолжения текста. */
  sure: boolean
  /** Языки с наибольшим счётом - для ничьей, которую решает подсказка. */
  leaders: VoiceLanguage[]
}

/** Язык текста по уликам; цитаты в кавычках не считаются, пока есть что считать вне их. */
export const readLanguage = (text: string): TextLanguage => {
  const outside = score(text.replace(QUOTED, ' '))
  const scores = total(outside) > 0 ? outside : score(text)
  const ranked = VOICE_LANGUAGES.filter((language) => (scores.get(language) ?? 0) > 0).sort(
    (left, right) => (scores.get(right) ?? 0) - (scores.get(left) ?? 0),
  )
  const top = ranked[0] ?? null

  if (!top) return { language: null, sure: false, leaders: [] }

  const best = scores.get(top) ?? 0
  const second = scores.get(ranked[1] ?? top) ?? 0
  const leaders = ranked.filter((language) => (scores.get(language) ?? 0) === best)
  const enough = BY_SCRIPT.has(top) ? best >= 1 : best >= SURE_SCORE
  const ahead = ranked.length === 1 || best >= second * 2

  return { language: top, sure: enough && ahead, leaders }
}

/**
 * Язык текста целиком для голоса: по уликам, ничью и пустой текст («Ok.», «Done.») решает
 * подсказка - язык реплики человека или выбранный в настройках.
 */
export const textLanguage = (text: string, hint: VoiceLanguage): VoiceLanguage => {
  const read = readLanguage(text)

  if (!read.language) return hint

  return read.leaders.includes(hint) ? hint : read.language
}

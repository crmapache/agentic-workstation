/**
 * Слова, по которым звонок решает без модели (spec, «Перебивание»): поддакивание не
 * перебивает агента и не уходит в чат, слова остановки обрывают ответ сразу на любом уровне.
 * Сравнение - по словам без регистра и знаков.
 */

/**
 * Поддакивание десяти языков Flux: «угу», «ага», «mhm», «sí», «ok» и похожие. Отсеивается только
 * пока агент говорит или работает: «да» после его вопроса - ответ, а не поддакивание.
 */
const BACKCHANNEL = new Set([
  // ru
  'угу',
  'ага',
  'ага-ага',
  'да',
  'да-да',
  'ну',
  'так',
  'понятно',
  'ясно',
  'хорошо',
  'ок',
  'окей',
  'мгм',
  'хм',
  // en
  'mhm',
  'mm',
  'hmm',
  'uh-huh',
  'uh',
  'um',
  'yeah',
  'yep',
  'yes',
  'ok',
  'okay',
  'right',
  'sure',
  'got',
  'it',
  'i',
  'see',
  // es, pt, it
  'sí',
  'si',
  'vale',
  'claro',
  'ajá',
  'aha',
  'sim',
  'tá',
  'certo',
  'beleza',
  'entendi',
  'bene',
  // fr, de, nl
  'oui',
  'ouais',
  'd’accord',
  'ja',
  'genau',
  'klar',
  'jawohl',
  'oké',
  // hi, ja
  'हाँ',
  'अच्छा',
  'はい',
  'うん',
  'ええ',
])

/** Слова остановки: «стоп», «хватит», «подожди», «stop», «wait» и их соседи. */
const STOP_WORDS = new Set([
  'стоп',
  'хватит',
  'подожди',
  'погоди',
  'остановись',
  'отмена',
  'stop',
  'wait',
  'cancel',
  'enough',
  'para',
  'espera',
  'basta',
  'pare',
  'arrête',
  'attends',
  'halt',
  'warte',
  'stopp',
  'aspetta',
  'ferma',
  'wacht',
  'रुको',
  'ストップ',
  '待って',
])

/** Слова реплики без регистра и знаков препинания вокруг. */
export const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)

/** Реплика - одно поддакивание: «угу», «да-да, понятно». Пустая - не поддакивание. */
export const isBackchannel = (text: string): boolean => {
  const words = wordsOf(text)

  return words.length > 0 && words.length <= 4 && words.every((word) => BACKCHANNEL.has(word))
}

/** Есть ли в реплике слово остановки - коротко, не дальше третьего слова. */
export const hasStopWord = (text: string): boolean =>
  wordsOf(text)
    .slice(0, 3)
    .some((word) => STOP_WORDS.has(word))

/** Реплика - одни слова остановки («стоп», «подожди»): её дело - остановить, а не уйти в чат. */
export const isStopOnly = (text: string): boolean => hasStopWord(text) && wordsOf(text).length <= 2

/**
 * Эхо собственного ответа: распознанные слова подряд стоят в том, что агент только что сказал.
 * Системное эхоподавление телефона убирает почти всё, это - вторая линия.
 */
export const isEcho = (heard: string, spoken: string): boolean => {
  const words = wordsOf(heard)

  if (words.length === 0) return false

  return ` ${wordsOf(spoken).join(' ')} `.includes(` ${words.join(' ')} `)
}

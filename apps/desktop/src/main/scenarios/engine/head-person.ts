/**
 * Разговор человека с головой, пока прогон идёт (HeadTalk в ACC): отдельным ходом, перед
 * следующим вопросом прогона или прямо в работу карточки, которую голова доделывает сама.
 */

const told = (said: readonly string[]): string[] => [...said.flatMap((one) => ['---', one]), '---']

/** Голова свободна - отдельный ход: это разговор, а не вопрос о карточке. */
export const toldRequest = (said: readonly string[], situation: string, toCard: boolean): string =>
  [
    '# The person running this scenario has written to you',
    '',
    situation,
    '',
    said.length > 1 ? 'They wrote, in this order:' : 'They wrote:',
    '',
    ...told(said),
    '',
    'This is a conversation, not a question about a card: answer them in a few sentences, and they read your answer in the run’s timeline as your reply. What they ask of you stands for the rest of the run - the slots you fill, the verdicts you give - until they take it back, so say plainly what you will do differently because of it. You can look at the project to answer them. What you cannot do is reach a card you have not been handed, or change the order of the run; if they ask for that, say so - pausing and stopping the run are their own buttons.',
    '',
    ...(toCard
      ? [
          'If part of it is for the card on the board, you can pass it on: its session reads your words between two of its own steps, as coming from the main thread. Pass on only what the card needs, in the words it needs them in.',
          '',
          'End with `{"toCard": "..."}` holding the words for the card, or `{}` when there is nothing to pass on.',
        ]
      : ['End with `{}`.']),
  ].join('\n')

/** Слова, написанные, пока голова отвечала прогону, - первыми в следующем вопросе. */
export const withTold = (said: readonly string[], question: string): string =>
  [
    said.length > 1
      ? 'Before the message below: the person running this scenario wrote to you while you were busy, in this order.'
      : 'Before the message below: the person running this scenario wrote to you while you were busy.',
    '',
    ...told(said),
    '',
    'What they ask of you stands for the rest of the run, until they take it back. Answer them in the sentences that go with your answer below - those are what they read in the timeline - and then answer the message below exactly as it asks.',
    '',
    '---',
    '',
    question,
  ].join('\n')

/** Слова в работу карточки, которую голова доделывает сама: ход бывает часом. */
export const toldMidWork = (said: readonly string[]): string =>
  [
    'The person running this scenario has written to you while you are finishing this card:',
    '',
    ...told(said),
    '',
    'Take it into the work, and carry on. When you are finished, end the way the message handing you the card asked for, and say in your sentences what you did about this.',
  ].join('\n')

/** Что карточка слышит, когда голова передаёт ей слова человека. */
export const relayedWords = (words: string): string =>
  `A word from the main thread, which the person running this scenario asked it to pass on to you:\n\n${words}`

/** Голова ответила без объекта - один раз сказано прямо. */
export const NO_OBJECT =
  'Your answer had no json object in it, so the panel has nothing to act on and the run cannot move. Answer again now, with the object the previous message asked for and nothing else.'

export const CARRY_ON = 'Carry on from where you stopped.'

/** Карточке после паузы и подхвата: её фоновые помощники остановку не пережили. */
export const CARD_CARRY_ON = `${CARRY_ON} Helpers you had started in the background did not survive the stop: start again any you still need.`

/** Голове, доделывающей карточку, после паузы: продолжать и кончить тем объектом. */
export const TAKE_OVER_CARRY_ON =
  'Carry on from where you stopped, and end with the object the message handing you this card asked for.'

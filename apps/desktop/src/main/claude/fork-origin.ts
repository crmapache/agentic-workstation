import type { ForkOrigin, Conversation } from '@shared/conversation'

import type { ForkLine, ForkAnchor } from './history/fork-anchor'
import { forkLeaf, forkChain, forkAnchor, forkLineOf } from './history/fork-anchor'
import { forEachLine } from './history/transcript-lines'
import { findTranscript } from './history/transcript-paths'

/**
 * Откуда читать форк: свой транскрипт источника и, если источник сам форк, - файл его
 * источника до точки, на которой он ответвлён. Строки - без отрезанного откатом (forkChain).
 * null - файла нет.
 */
export type ForkTranscripts = {
  own: () => Promise<readonly ForkLine[] | null>
  inherited: () => Promise<readonly ForkLine[] | null>
}

type Source = { sessionId: string; title: string }

const originAt = ({ sessionId, title }: Source, at: string, whole = false): ForkOrigin => ({
  sourceSessionId: sessionId,
  sourceTitle: title,
  at,
  ...(whole && { whole }),
})

/** Форк источника целиком: до последней строки, а без строк - нести нечего. */
const wholeOf = (source: Source, lines: readonly ForkLine[], whole: boolean): ForkOrigin | null => {
  const at = forkLeaf(lines)

  return at ? originAt(source, at, whole) : null
}

/** Точка в унаследованном: форк делается от источника источника. */
const inheritedAt = (parent: ForkOrigin, anchor: ForkAnchor | null): ForkOrigin | null =>
  anchor?.kind === 'at'
    ? originAt({ sessionId: parent.sourceSessionId, title: parent.sourceTitle }, anchor.uuid)
    : null

/**
 * Откуда пойдёт форк разговора: источник и строка, до которой он несёт его. Точка
 * считается в момент нажатия. null - нести нечего (форк от первого сообщения или
 * пустого разговора): форк начинается чистым разговором. Сообщение, которого в
 * транскрипте нет (форк форка выше сжатия, старое сообщение), ищется у источника
 * источника; не нашлось нигде - форк несёт разговор целиком и говорит об этом (whole):
 * форк, молча несущий то, от чего уходили, хуже объяснённого (ACC).
 */
export const resolveForkOrigin = async (
  source: Conversation,
  beforeMessageId: string | null,
  transcripts: ForkTranscripts,
): Promise<ForkOrigin | null> => {
  const own = await transcripts.own()
  const parent = source.fork

  if (own) {
    if (beforeMessageId === null) return wholeOf(source, own, false)

    const anchor = forkAnchor(own, beforeMessageId)

    if (anchor.kind === 'at') return originAt(source, anchor.uuid)
    if (anchor.kind === 'start') return null

    // Унаследованное выше сжатия лежит только у источника: форк делается от него.
    const inherited = parent ? await transcripts.inherited() : null
    const older = inherited ? forkAnchor(inherited, beforeMessageId) : null

    if (older?.kind === 'start') return null

    return (parent && inheritedAt(parent, older)) ?? wholeOf(source, own, true)
  }

  // Форк форка, в котором ещё не говорили, - форк того же источника: своего файла нет.
  if (!parent) return null

  const from = { sessionId: parent.sourceSessionId, title: parent.sourceTitle }

  if (beforeMessageId === null) return originAt(from, parent.at)

  // Точка ищется по всему унаследованному, а не по окну ленты: родитель сообщения мог
  // лежать выше окна.
  const inherited = await transcripts.inherited()

  if (!inherited) return null

  const anchor = forkAnchor(inherited, beforeMessageId)

  if (anchor.kind === 'start') return null

  return inheritedAt(parent, anchor) ?? originAt(from, parent.at, true)
}

/**
 * Сведения о строках файла построчным чтением: транскрипт целиком в память не берётся -
 * с картинками он бывает в гигабайт, и чтение одной строкой падало, а кнопка форка молчала.
 */
const forkLinesIn = async (file: string): Promise<ForkLine[]> => {
  const lines: ForkLine[] = []

  await forEachLine(file, (line) => {
    if (line) lines.push(forkLineOf(line))
  })

  return lines
}

/** Транскрипты разговора на диске: свой и унаследованный до точки ответвления. */
const diskTranscripts = (source: Conversation): ForkTranscripts => ({
  own: async () => {
    const file = await findTranscript(source.projectPath, source.sessionId)

    return file ? forkChain(await forkLinesIn(file)) : null
  },
  inherited: async () => {
    const { fork } = source
    const file = fork ? await findTranscript(source.projectPath, fork.sourceSessionId) : null

    return file && fork ? forkChain(await forkLinesIn(file), fork.at) : null
  },
})

/** Точка форка по транскриптам на диске - см. resolveForkOrigin. */
export const forkOriginFor = (
  source: Conversation,
  beforeMessageId: string | null,
): Promise<ForkOrigin | null> => resolveForkOrigin(source, beforeMessageId, diskTranscripts(source))

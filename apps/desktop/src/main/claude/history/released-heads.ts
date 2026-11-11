import { JsonFile } from '../../storage/json-file'

/**
 * Разговоры голов прогонов сценариев, открытые обычной вкладкой чата («Continue in a chat»), -
 * роль главного потока с них снята (как AFTER_SCENARIO_HEAD в ACC). Транскрипт головы - сотни
 * строк указаний «ты не пишешь в файлы, отвечай объектом», и модель над ним продолжает им
 * подчиняться. Снимаем в двух местах, и второе обязательно: строка в системном промпте каждого
 * процесса вкладки и рамка один раз перед первым сообщением человека - одного системного
 * промпта в ACC не хватало ни разу из трёх.
 */

/** Добавка к системному промпту: одна строка без кавычек - это аргумент запуска. */
export const RELEASED_BRIEFING =
  'This conversation used to be the main thread of a scenario run. That run is over, and the person now talks to you directly, as in an ordinary chat: the rules of that role - no Write and no Edit, answering with a json object - no longer apply.'

/** Рамка перед первым сообщением человека: та же мысль, сказанная в самом разговоре. */
export const RELEASED_FRAME =
  '[The scenario run you were the main thread of is over. You are no longer its main thread: the person is talking to you directly now, as in an ordinary chat. The rules of that role - no Write and no Edit, a json object at the end of every answer - no longer apply. You may read and change files, run commands and do whatever is asked, exactly as any Claude Code session would. Everything you remember of the run still holds.]'

type Stored = { released: string[]; framed: string[] }

let file: JsonFile<Stored> | null = null
const released = new Set<string>()
const framed = new Set<string>()

const save = () => {
  void file
    ?.write({ released: [...released], framed: [...framed] })
    .catch((error: unknown) => console.warn('[claude] снятые роли голов не записались:', error))
}

/** Прочитать с диска: снятая роль переживает перезапуск IDE. */
export const loadReleasedHeads = async (path: string): Promise<void> => {
  file = new JsonFile<Stored>(path)

  const stored = (await file.read()) as Partial<Stored> | null
  const ids = (value: unknown) =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []

  for (const id of ids(stored?.released)) released.add(id)
  for (const id of ids(stored?.framed)) framed.add(id)
}

/** Разговор головы открыли чатом - снять роль. */
export const releaseHead = (sessionId: string): void => {
  if (!sessionId || released.has(sessionId)) return

  released.add(sessionId)
  save()
}

/** Добавка к системному промпту процесса вкладки; пусто - разговор не голова. */
export const releasedBriefing = (sessionId: string): string =>
  released.has(sessionId) ? RELEASED_BRIEFING : ''

/** Рамка - один раз на разговор: дальше её несёт сам транскрипт. */
export const takeReleasedFrame = (sessionId: string): string => {
  if (!released.has(sessionId) || framed.has(sessionId)) return ''

  framed.add(sessionId)
  save()

  return RELEASED_FRAME
}

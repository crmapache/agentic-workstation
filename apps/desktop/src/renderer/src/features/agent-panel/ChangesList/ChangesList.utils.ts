import type { FileChange } from '@shared/conversation-feed'

import { REFUSAL_KEYS, QUIET_PRESS_MS, PRESS_PATIENCE_MS } from './ChangesList.constants'
import type { Press, Presses, RowNote } from './ChangesList.types'

/** Строку можно откатить: точный дифф есть, и она ещё не откачена. */
export const canRevert = (change: FileChange): boolean => change.undoable && !change.reverted

/** Строку можно вернуть: она откачена, и дифф, чтобы вернуть, есть. */
export const canRestore = (change: FileChange): boolean => change.undoable && change.reverted

/** Нажатия плюс новое по каждому из файлов. */
export const withPress = (
  presses: Presses,
  changes: readonly FileChange[],
  press: Press,
): Presses => new Map([...presses, ...changes.map((change) => [change.path, press] as const)])

/** Без нажатий с этим token: пришёл ответ на них. */
export const withoutToken = (presses: Presses, token: number): Presses => {
  const left = [...presses].filter(([, press]) => press.token !== token)

  return left.length === presses.size ? presses : new Map(left)
}

/** Без нажатий, ждущих дольше предохранителя: строку можно нажать снова. */
export const withoutStale = (presses: Presses, now: number): Presses => {
  const left = [...presses].filter(([, press]) => now - press.at < PRESS_PATIENCE_MS)

  return left.length === presses.size ? presses : new Map(left)
}

/** Нажатия, ждущие дольше тихой паузы, - объявлены: строка скажет «Reverting…». */
export const announced = (presses: Presses, now: number): Presses => {
  const due = (press: Press) => !press.announced && now - press.at >= QUIET_PRESS_MS

  if (![...presses.values()].some(due)) return presses

  return new Map(
    [...presses].map(([path, press]) => [path, due(press) ? { ...press, announced: true } : press]),
  )
}

/** Через сколько мс случится следующее из событий нажатий (пауза, предохранитель); null - нечего ждать. */
export const nextPressEvent = (presses: Presses, now: number): number | null => {
  const moments = [...presses.values()].map((press) =>
    press.announced ? press.at + PRESS_PATIENCE_MS : press.at + QUIET_PRESS_MS,
  )

  return moments.length > 0 ? Math.max(0, Math.min(...moments) - now) : null
}

/**
 * Слова на строке: ждёт ответа дольше паузы - «Reverting…» / «Bringing back…»; отказ
 * последнего нажатия; файла нет на диске (открыть не вышло); откачен - «Reverted».
 */
export const rowNote = (
  change: FileChange,
  press: Press | undefined,
  gone: boolean,
): RowNote | null => {
  if (press?.announced) {
    return {
      key: press.restore ? 'agentPanel.changes.restoring' : 'agentPanel.changes.reverting',
      bad: false,
    }
  }
  if (press) return null
  if (change.refusal) return { key: REFUSAL_KEYS[change.refusal], bad: true }
  if (gone) return { key: 'agentPanel.changes.refusedMissing', bad: true }
  if (change.reverted) return { key: 'agentPanel.changes.reverted', bad: false }

  return null
}

/** Плюс строки: у созданного - сколько строк в файле вышло (добавленное минус снятое правками). */
export const addedShown = (change: FileChange): number =>
  change.created ? Math.max(change.added - change.removed, 0) : change.added

/**
 * Строки всего хода плюсом и минусом - сумма того, что говорят строки, поэтому шапка не
 * спорит со списком под ней (откаченные тоже: список - запись того, что ход сделал). Файл,
 * который посчитать нечем («±»), в сумму не входит.
 */
export const turnTotals = (changes: readonly FileChange[]): { added: number; removed: number } =>
  changes.reduce(
    (sum, change) =>
      change.counted
        ? {
            added: sum.added + addedShown(change),
            removed: sum.removed + (change.created ? 0 : change.removed),
          }
        : sum,
    { added: 0, removed: 0 },
  )

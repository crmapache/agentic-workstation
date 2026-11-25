import { mkdir, appendFile } from 'node:fs/promises'
import { EOL } from 'node:os'
import { dirname } from 'node:path'

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * Строка журнала обновления (update.log) - того же вида, что пишут маковский скрипт подмены и
 * сторож установки на Windows: местное время и «update:», чтобы шаги IDE и сторожа читались одной
 * лентой.
 */
export const updateLogLine = (at: Date, text: string): string =>
  `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
  `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())} update: ${text}`

/**
 * Дописать шаг в update.log. На Windows у собранной IDE нет консоли, и console.warn уходит в
 * никуда: без этой записи сбой обновления не разобрать. Сама запись не бросает - журнал помогает
 * разбору, а не решает, встанет ли обновление.
 */
export const appendUpdateLog = async (logPath: string, text: string): Promise<void> => {
  try {
    await mkdir(dirname(logPath), { recursive: true })
    await appendFile(logPath, `${updateLogLine(new Date(), text)}${EOL}`)
  } catch {
    // Нет места или прав на папку журналов - обновление идёт и без записи.
  }
}

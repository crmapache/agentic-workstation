import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { IS_WINDOWS } from '../platform'
import { ComputerError } from './computer-error'

const run = promisify(execFile)

/** Приложение из меню «Пуск» Windows: имя и AppID, по которому его запускает оболочка. */
export type StartApp = { Name: string; AppID: string }

/**
 * Все приложения меню «Пуск», в том числе из Microsoft Store, - папка оболочки shell:AppsFolder,
 * то же, что читает Get-StartApps. Сам Get-StartApps - функция модуля, а политика скриптов
 * Windows по умолчанию (Restricted) модули не грузит; обычной команде она не мешает. Вывод - в
 * UTF-8: Windows PowerShell пишет в кодировке консоли, и «Блокнот» приходил бы знаками замены.
 */
const START_APPS =
  '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; ' +
  "(New-Object -ComObject Shell.Application).NameSpace('shell:AppsFolder').Items() | " +
  'ForEach-Object { [pscustomobject]@{ Name = $_.Name; AppID = $_.Path } } | ' +
  'ConvertTo-Json -Compress'

/** Запрос модели как есть внутри регулярного выражения. */
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Какое приложение меню «Пуск» имела в виду модель: точное имя без регистра, потом имя, где запрос
 * стоит отдельным словом, потом начинается с него, потом содержит его; среди равных - самое
 * короткое имя («chrome» - Google Chrome, а не Chrome Remote Desktop). Имени нет ни в каком виде -
 * последняя попытка по AppID: имена локализованы, а он нет.
 */
export const pickStartApp = (apps: readonly StartApp[], name: string): StartApp | null => {
  const wanted = name.trim().toLowerCase()

  if (!wanted) return null

  const asWord = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(wanted)}($|[^\\p{L}\\p{N}])`, 'u')
  const byLength = [...apps].sort((a, b) => a.Name.length - b.Name.length)
  const named = (test: (app: string) => boolean) =>
    byLength.find((app) => test(app.Name.toLowerCase()))

  return (
    named((app) => app === wanted) ??
    named((app) => asWord.test(app)) ??
    named((app) => app.startsWith(wanted)) ??
    named((app) => app.includes(wanted)) ??
    // Имена в «Пуске» - на языке Windows («Блокнот»), а модель пишет по-английски. AppID всегда
    // латиницей и почти всегда с английским именем: Microsoft.WindowsNotepad_..., ...Calculator_...
    byLength.find((app) => app.AppID.toLowerCase().includes(wanted.replace(/\s+/g, ''))) ??
    null
  )
}

/** Ответ Get-StartApps: одно приложение PowerShell отдаёт объектом, несколько - списком. */
export const parseStartApps = (json: string): StartApp[] => {
  // Метка порядка байтов в начале - не часть JSON.
  const text = json.replace(/^\uFEFF/, '').trim()
  const value: unknown = text ? JSON.parse(text) : []
  const list = Array.isArray(value) ? value : [value]

  return list.filter(
    (app): app is StartApp =>
      typeof app === 'object' &&
      app !== null &&
      typeof (app as StartApp).Name === 'string' &&
      typeof (app as StartApp).AppID === 'string',
  )
}

/**
 * Windows: найти приложение в меню «Пуск» и запустить его через оболочку - как человек нажал бы
 * его в «Пуске». explorer.exe отвечает кодом 1 и при успехе, поэтому его не ждут. Список не
 * прочитался - модель узнаёт это словами и открывает приложение мышью.
 */
const openOnWindows = async (name: string, signal: AbortSignal): Promise<string> => {
  let apps: StartApp[]

  try {
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', START_APPS],
      { signal, windowsHide: true, encoding: 'utf8' },
    )

    apps = parseStartApps(stdout)
  } catch (error) {
    if (signal.aborted) throw error

    throw new ComputerError(
      'failed',
      'Windows did not list the Start menu apps. Open the app by hand with the mouse instead.',
    )
  }

  const app = pickStartApp(apps, name)

  if (!app)
    throw new ComputerError(
      'failed',
      `Windows found no app named "${name}" in the Start menu. Its names are in the language of Windows: try the local name, or open the app with the mouse.`,
    )

  // Без windowsHide: скрытый запуск оболочки Windows передаёт и приложению - оно встало бы без
  // окна (проверено на Windows 11: Блокнот работал, а окна не было).
  spawn('explorer.exe', [`shell:AppsFolder\\${app.AppID}`], {
    detached: true,
    stdio: 'ignore',
  }).unref()

  return app.Name
}

/** Мак: open -a запускает приложение или выводит уже открытое вперёд. */
const openOnMac = async (name: string, signal: AbortSignal): Promise<string> => {
  try {
    await run('/usr/bin/open', ['-a', name], { signal })
  } catch (error) {
    if (signal.aborted) throw error

    throw new ComputerError('failed', `macOS found no app named "${name}".`)
  }

  return name
}

/** Запустить приложение по имени или вывести вперёд; ответ - имя, под которым его нашли. */
export const openApp = (name: string, signal: AbortSignal): Promise<string> =>
  IS_WINDOWS ? openOnWindows(name, signal) : openOnMac(name, signal)

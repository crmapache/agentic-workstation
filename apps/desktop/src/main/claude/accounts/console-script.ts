import { chmod, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { IS_WINDOWS } from '../../platform'
import { psQuote } from '../../windows/powershell'
import { OUTRANKING, DRAWER_VARIABLE } from './account-env'

/** Строка для shell в одинарных кавычках: внутри ничего не раскрывается. */
export const quote = (value: string) => `'${value.split("'").join(`'\\''`)}'`

/** Слово, которое обеим оболочкам можно отдать без кавычек: `auth`, `/logout`. */
const PLAIN_WORD = /^[\w./:-]+$/

const argument = (value: string, windows: boolean) =>
  PLAIN_WORD.test(value) ? value : windows ? psQuote(value) : quote(value)

/**
 * Скрипт для окна терминала: окружение хранилища аккаунта, строки перед запуском и сам CLI.
 * Окружение - строками скрипта, а не префиксом команды в чужой оболочке: ошибка в кавычках
 * молча вошла бы в хранилище по умолчанию. На маке - zsh для Терминала, на Windows - PowerShell
 * (ADR 0048). Переменные, что перебили бы хранилище, пустые (на маке) или убраны (PowerShell
 * пустую переменную и так убирает).
 */
export const consoleScript = (
  binary: string,
  drawer: string | null,
  args: readonly string[],
  windows: boolean,
  before: readonly string[] = [],
): string => {
  if (windows) {
    const unset = (name: string) => `Remove-Item Env:${name} -ErrorAction SilentlyContinue`

    return [
      drawer === null ? unset(DRAWER_VARIABLE) : `$env:${DRAWER_VARIABLE} = ${psQuote(drawer)}`,
      ...(drawer === null ? [] : OUTRANKING.map(unset)),
      ...before,
      `& ${psQuote(binary)} ${args.map((arg) => argument(arg, true)).join(' ')}`,
      '',
    ].join('\r\n')
  }

  return [
    '#!/bin/zsh',
    drawer === null ? `unset ${DRAWER_VARIABLE}` : `export ${DRAWER_VARIABLE}=${quote(drawer)}`,
    ...(drawer === null ? [] : OUTRANKING.map((name) => `export ${name}=''`)),
    ...before,
    `exec ${quote(binary)} ${args.map((arg) => argument(arg, false)).join(' ')}`,
    '',
  ].join('\n')
}

/**
 * Записать скрипт и отдать путь, который откроет система (shell.openPath). На маке это
 * `.command` - Терминал запускает его как есть. На Windows рядом с `.ps1` ложится `.cmd`: его
 * система запускает в окне консоли, а `.ps1` открыла бы в Блокноте. `.ps1` - с BOM: иначе
 * PowerShell 5 прочёл бы путь с не-ASCII буквами в кодировке системы.
 */
export const writeConsoleScript = async (
  dir: string,
  name: string,
  script: string,
): Promise<string> => {
  if (!IS_WINDOWS) {
    const file = join(dir, `${name}.command`)

    await writeFile(file, script, { mode: 0o700 })
    await chmod(file, 0o700)

    return file
  }

  const body = join(dir, `${name}.ps1`)
  const launcher = join(dir, `${name}.cmd`)

  await writeFile(body, `\ufeff${script}`)
  await writeFile(
    launcher,
    `@powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0${name}.ps1"\r\n`,
  )

  return launcher
}

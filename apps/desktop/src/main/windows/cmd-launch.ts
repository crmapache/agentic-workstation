import { IS_WINDOWS } from '../platform'

/** Что передать в spawn или execFile: файл, аргументы и не трогать ли их кавычки. */
export type LaunchTarget = { file: string; args: string[]; verbatim: boolean }

/** Метасимволы cmd.exe: перед каждым - «^», иначе cmd прочтёт их как свои. */
const CMD_META = /([()\][%!^"`<>&|;, *?])/g

/** Обёртка, которую Windows запускает только через cmd.exe. */
const BATCH = /\.(cmd|bat)$/i

/**
 * Аргумент для строки cmd.exe: кавычки и черты по правилам разбора аргументов Windows, потом
 * «^» перед метасимволами - дважды: обёртка npm и pnpm (`kimi.cmd`) передаёт `%*` дальше, и
 * cmd.exe разбирает строку второй раз. Так делает cross-spawn, которым npm запускает такие же
 * обёртки.
 */
export const cmdArgument = (arg: string): string => {
  const quoted = `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`

  return quoted.replace(CMD_META, '^$1').replace(CMD_META, '^$1')
}

/**
 * Как запустить файл. Обёртку `.cmd` (CLI из npm или pnpm на Windows) Node без оболочки не
 * запускает - отказ EINVAL, поэтому её - через cmd.exe, как велит документация Node. Человеческих
 * слов в аргументах таких запусков нет (у агентов ACP они идут через stdin), а аргументы IDE
 * экранированы. Остальное - как есть.
 */
export const launchTarget = (
  file: string,
  args: readonly string[],
  windows = IS_WINDOWS,
  shell = process.env['ComSpec'] || 'cmd.exe',
): LaunchTarget => {
  if (!windows || !BATCH.test(file)) return { file, args: [...args], verbatim: false }

  const line = [file.replace(CMD_META, '^$1'), ...args.map(cmdArgument)].join(' ')

  // /d - без AutoRun человека из реестра, /s /c - снять внешние кавычки и выполнить строку.
  return { file: shell, args: ['/d', '/s', '/c', `"${line}"`], verbatim: true }
}

import { it, expect, describe } from 'vitest'

import { cmdArgument, launchTarget } from './cmd-launch'

const CMD = 'C:\\Windows\\System32\\cmd.exe'

describe('запуск обёртки .cmd на Windows', () => {
  it('на маке и для .exe - как есть, без cmd.exe', () => {
    expect(launchTarget('/Users/me/.kimi-code/bin/kimi', ['acp'], false, CMD)).toEqual({
      file: '/Users/me/.kimi-code/bin/kimi',
      args: ['acp'],
      verbatim: false,
    })
    expect(launchTarget('C:\\Users\\me\\.kimi-code\\bin\\kimi.exe', ['acp'], true, CMD)).toEqual({
      file: 'C:\\Users\\me\\.kimi-code\\bin\\kimi.exe',
      args: ['acp'],
      verbatim: false,
    })
  })

  it('.cmd из npm - через cmd.exe /d /s /c одной строкой, пробел в пути экранирован', () => {
    expect(
      launchTarget('C:\\Users\\John Smith\\AppData\\Roaming\\npm\\kimi.cmd', ['acp'], true, CMD),
    ).toEqual({
      file: CMD,
      args: [
        '/d',
        '/s',
        '/c',
        '"C:\\Users\\John^ Smith\\AppData\\Roaming\\npm\\kimi.cmd ^^^"acp^^^""',
      ],
      verbatim: true,
    })
  })

  it('расширение без учёта регистра, .bat - тоже через cmd.exe', () => {
    expect(launchTarget('C:\\tools\\KIMI.CMD', [], true, CMD).file).toBe(CMD)
    expect(launchTarget('C:\\tools\\kimi.bat', [], true, CMD).file).toBe(CMD)
  })

  it('аргумент: кавычки, черты перед кавычкой и в конце - по правилам Windows, метасимволы - дважды', () => {
    expect(cmdArgument('acp')).toBe('^^^"acp^^^"')
    expect(cmdArgument('a b')).toBe('^^^"a^^^ b^^^"')
    expect(cmdArgument('100%&x')).toBe('^^^"100^^^%^^^&x^^^"')
    // `say "hi"\` → "say \"hi\"\\" до экранирования метасимволов.
    expect(cmdArgument('say "hi"\\')).toBe('^^^"say^^^ \\^^^"hi\\^^^"\\\\^^^"')
  })
})

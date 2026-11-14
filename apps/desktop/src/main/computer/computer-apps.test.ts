import { it, expect, describe } from 'vitest'

import { pickStartApp, parseStartApps } from './computer-apps'

const APPS = [
  { Name: 'Chrome Remote Desktop', AppID: 'remote' },
  { Name: 'Google Chrome', AppID: 'Chrome' },
  { Name: 'Notepad', AppID: 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App' },
  {
    Name: 'Settings',
    AppID: 'windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel',
  },
]

describe('Start menu apps', () => {
  it('takes the exact name first, then a name that starts with it, then one that has it', () => {
    expect(pickStartApp(APPS, 'notepad')?.AppID).toBe(APPS[2]?.AppID)
    expect(pickStartApp(APPS, 'Google')?.Name).toBe('Google Chrome')
    expect(pickStartApp(APPS, 'chrome')?.Name).toBe('Google Chrome')
    expect(pickStartApp(APPS, 'Photoshop')).toBeNull()
    expect(pickStartApp(APPS, '  ')).toBeNull()
  })

  it('reads one app as an object and many as a list, skipping anything else', () => {
    expect(parseStartApps('{"Name":"Notepad","AppID":"n"}')).toEqual([
      { Name: 'Notepad', AppID: 'n' },
    ])
    expect(parseStartApps('[{"Name":"A","AppID":"a"},{"Name":null}]')).toEqual([
      { Name: 'A', AppID: 'a' },
    ])
    expect(parseStartApps('')).toEqual([])
  })

  it('reads names in any language, after a byte order mark', () => {
    const apps = parseStartApps(
      '\uFEFF[{"Name":"Блокнот","AppID":"notepad"},{"Name":"Configuración","AppID":"settings"}]',
    )

    expect(pickStartApp(apps, 'блокнот')?.AppID).toBe('notepad')
    expect(pickStartApp(apps, 'configuración')?.AppID).toBe('settings')
  })

  it('finds a localized app by its English AppID when the name is in another language', () => {
    const russian = [
      { Name: 'Блокнот', AppID: 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App' },
      { Name: 'Калькулятор', AppID: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' },
    ]

    expect(pickStartApp(russian, 'Notepad')?.Name).toBe('Блокнот')
    expect(pickStartApp(russian, 'Windows Calculator')?.Name).toBe('Калькулятор')
    expect(pickStartApp(russian, 'Photoshop')).toBeNull()
  })
})

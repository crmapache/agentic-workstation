import { it, expect, describe } from 'vitest'

import { registryPathOf } from './registry-path'

describe('PATH из реестра', () => {
  it('системный, потом человека - одним PATH через «;»', () => {
    const output =
      'C:\\Windows\\system32;C:\\Windows;C:\\Program Files\\Git\\cmd;\r\n' +
      'C:\\Users\\Иван\\AppData\\Local\\Microsoft\\WinGet\\Links;C:\\Users\\Иван\\AppData\\Roaming\\npm\r\n'

    expect(registryPathOf(output)).toBe(
      'C:\\Windows\\system32;C:\\Windows;C:\\Program Files\\Git\\cmd;' +
        'C:\\Users\\Иван\\AppData\\Local\\Microsoft\\WinGet\\Links;C:\\Users\\Иван\\AppData\\Roaming\\npm',
    )
  })

  it('PATH человека пуст или PowerShell не ответил; метка порядка байтов не часть пути', () => {
    expect(registryPathOf('\uFEFFC:\\Windows\r\n\r\n')).toBe('C:\\Windows')
    expect(registryPathOf('')).toBe('')
  })
})

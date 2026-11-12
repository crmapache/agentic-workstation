import { it, expect, describe } from 'vitest'

import { terminalCommandScript } from './design-login'

describe('команда CLI в Терминале (Claude Design, выход)', () => {
  it('в хранилище аккаунта в работе: переменная и пустые ключи, которые иначе его бьют', () => {
    const script = terminalCommandScript('/bin/claude', "/d/s-1'x", 'design-login')

    expect(script).toContain(`export CLAUDE_SECURESTORAGE_CONFIG_DIR='/d/s-1'\\''x'`)
    expect(script).toContain(`export ANTHROPIC_API_KEY=''`)
    expect(script).toContain(`exec '/bin/claude' /design-login`)
  })

  it('обычный вход - без переменной хранилища, даже унаследованной', () => {
    const script = terminalCommandScript('/bin/claude', null, 'logout')

    expect(script).toContain('unset CLAUDE_SECURESTORAGE_CONFIG_DIR')
    expect(script).toContain(`exec '/bin/claude' /logout`)
    expect(script).not.toContain('ANTHROPIC_API_KEY')
  })

  it('на Windows - PowerShell: переменная хранилища, ключи убраны, CLI с кавычками PowerShell', () => {
    const script = terminalCommandScript(
      'C:\\Users\\me\\claude.exe',
      "C:\\d\\s-1'x",
      'logout',
      true,
    )

    expect(script).toContain(`$env:CLAUDE_SECURESTORAGE_CONFIG_DIR = 'C:\\d\\s-1''x'`)
    expect(script).toContain('Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue')
    expect(script).toContain(`& 'C:\\Users\\me\\claude.exe' /logout`)
    expect(script).not.toContain('#!/bin/zsh')
  })
})

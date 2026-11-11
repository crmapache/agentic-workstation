import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { zshIntegrationEnv, prepareZshIntegration } from './zsh-integration'

const ZSH = '/bin/zsh'
const run = promisify(execFile)

/** Что видно в оболочке после запуска через обёртку: по строке на значение. */
const REPORT = [
  'print -r -- "env=$FROM_USER_ENV"',
  'print -r -- "rc=$FROM_USER_RC"',
  'print -r -- "zdotdir=${ZDOTDIR-unset}"',
  'print -r -- "histfile=$HISTFILE"',
  'print -r -- "prompt=$PROMPT"',
  'print -r -- "leftover=${(k)functions[(I)_agentic_workstation_*]}${_agentic_workstation_dir}"',
].join('; ')

const shellReport = async (home: string, dir: string, userZdotdir?: string) => {
  const env = {
    HOME: home,
    PATH: '/usr/bin:/bin',
    TERM: 'xterm-256color',
    ...zshIntegrationEnv(ZSH, userZdotdir ? { ZDOTDIR: userZdotdir } : {}, dir),
  }
  const { stdout } = await run(ZSH, ['-l', '-i', '-c', REPORT], { env })

  return Object.fromEntries(
    stdout
      .trim()
      .split('\n')
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  )
}

describe.skipIf(!existsSync(ZSH))('обёртка zsh терминала', () => {
  let root = ''
  let home = ''
  let dir = ''

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'agentic-workstation-zsh-'))
    home = join(root, 'home')
    dir = join(root, 'integration')
    await mkdir(home)
    await prepareZshIntegration(dir)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('файлы человека читаются, история и ZDOTDIR - его, приглашение по умолчанию - в цвет', async () => {
    await writeFile(join(home, '.zshenv'), 'export FROM_USER_ENV=1\n')
    await writeFile(
      join(home, '.zshrc'),
      'export FROM_USER_RC=1\nPS1="%n@%m %1~ %# "\nHISTFILE=${ZDOTDIR:-$HOME}/.zsh_history\n',
    )

    const report = await shellReport(home, dir)

    expect(report['env']).toBe('1')
    expect(report['rc']).toBe('1')
    expect(report['zdotdir']).toBe('unset')
    expect(report['histfile']).toBe(join(home, '.zsh_history'))
    expect(report['prompt']).toContain('%F{blue}')
    expect(report['leftover']).toBe('')
  })

  it('своё приглашение человека не трогает, история не уезжает в обёртку', async () => {
    await writeFile(join(home, '.zshrc'), "PROMPT='mine> '\n")

    const report = await shellReport(home, dir)

    expect(report['prompt']).toBe('mine> ')
    // /etc/zshrc macOS кладёт историю в ZDOTDIR, а на запуске это папка обёртки.
    expect(report['histfile']).not.toContain(dir)
  })

  it('свой ZDOTDIR человека: файлы - оттуда, и он остаётся после запуска', async () => {
    const own = join(home, '.config', 'zsh')

    await mkdir(own, { recursive: true })
    await writeFile(join(own, '.zshrc'), 'export FROM_USER_RC=1\n')

    const report = await shellReport(home, dir, own)

    expect(report['rc']).toBe('1')
    expect(report['zdotdir']).toBe(own)
  })
})

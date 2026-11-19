import { rm, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { isCompactWindow, instructionsSetup } from './opencode-instructions'
import { launchConfig } from './opencode-launch'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'opencode-instructions-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const NO_SKILLS = [{ action: 'skill.use', resource: '*', effect: 'deny' }]

describe('указания процесса OpenCode', () => {
  it('маленькое и неизвестное окно - компактные, большое - полные', () => {
    expect(isCompactWindow(65_536)).toBe(true)
    expect(isCompactWindow(0)).toBe(true)
    expect(isCompactWindow(128_000)).toBe(false)
    expect(isCompactWindow(262_144)).toBe(false)
  })

  it('полные - ничего сверх того, что OpenCode берёт сам', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), '# Rules')

    expect(await instructionsSetup(dir, false)).toEqual({ env: {}, config: {} })
  })

  it('компактные - без Claude Code и скиллов, CLAUDE.md папки - указанием', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), '# Rules')

    expect(await instructionsSetup(dir, true)).toEqual({
      env: { OPENCODE_DISABLE_CLAUDE_CODE: '1' },
      config: { instructions: [join(dir, 'CLAUDE.md')], policies: NO_SKILLS },
    })
  })

  it('с AGENTS.md CLAUDE.md не берётся - как у самого OpenCode; без файлов - только запреты', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), '# Rules')
    await writeFile(join(dir, 'AGENTS.md'), '# Agents')

    expect((await instructionsSetup(dir, true)).config).toEqual({ policies: NO_SKILLS })
    expect((await instructionsSetup(join(dir, 'missing'), true)).config).toEqual({
      policies: NO_SKILLS,
    })
  })

  it('указания ложатся в конфиг процесса рядом с подключениями', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), '# Rules')

    const { config } = await instructionsSetup(dir, true)
    const parsed: unknown = JSON.parse(
      launchConfig({ providers: {}, model: null, connectors: null, instructions: config }),
    )

    expect(parsed).toMatchObject({
      share: 'disabled',
      instructions: [join(dir, 'CLAUDE.md')],
      policies: NO_SKILLS,
      providers: {},
    })
  })
})

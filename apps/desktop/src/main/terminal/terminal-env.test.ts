import { it, expect, describe } from 'vitest'

import { terminalEnv } from './terminal-env'

describe('terminalEnv', () => {
  it('убирает личное IDE и чужого терминала, ставит свой тип', () => {
    const env = terminalEnv(
      {
        PATH: '/usr/bin',
        HOME: '/Users/me',
        ELECTRON_RENDERER_URL: 'http://localhost:5315',
        AGENTIC_WORKSTATION_PROFILE_DIR: '/tmp/x',
        TERMINAL_EMULATOR: 'JetBrains-JediTerm',
        npm_config_user_agent: 'pnpm',
        NODE_ENV: 'development',
        TERM: 'dumb',
      },
      '1.2.3',
    )

    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/Users/me',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'AgenticWorkstation',
      TERM_PROGRAM_VERSION: '1.2.3',
      LANG: 'en_US.UTF-8',
      CLICOLOR: '1',
    })
  })

  it('свою кодировку человека не трогает', () => {
    expect(terminalEnv({ LANG: 'ru_RU.UTF-8' }, '1').LANG).toBe('ru_RU.UTF-8')
  })
})

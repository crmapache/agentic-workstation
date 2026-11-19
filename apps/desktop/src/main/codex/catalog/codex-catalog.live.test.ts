import { rm, mkdtemp } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import { locateCodexCli } from '../cli/codex-locator'
import { replayTurns } from '../feed/codex-replay'
import { CodexCatalog } from './codex-catalog'

/**
 * Каталог на настоящем Codex этой машины: модели и кто вошёл. Ходит в сеть OpenAI, поэтому
 * только по переменной: `AGENTIC_WORKSTATION_CODEX_LIVE=1 npx vitest run codex-catalog.live`.
 */
describe.skipIf(process.env['AGENTIC_WORKSTATION_CODEX_LIVE'] !== '1')(
  'каталог Codex вживую',
  () => {
    it('модели с уровнями усилия и аккаунт', async () => {
      const catalog = new CodexCatalog({
        cli: () => locateCodexCli(),
        version: '0.0.0',
        cwd: homedir(),
      })
      const models = await catalog.models()
      const account = await catalog.account()

      console.info(
        '[codex live] models',
        models.map((model) => `${model.value} ${model.efforts?.join('/')}`),
      )
      console.info('[codex live] account', account?.kind, account?.plan)
      expect(models.length).toBeGreaterThan(0)
      await catalog.dispose()
    }, 60_000)

    it('прошлые ходы последнего разговора папки собираются в ленту', async () => {
      const project = process.env['AGENTIC_WORKSTATION_CODEX_LIVE_PROJECT'] ?? homedir()
      const catalog = new CodexCatalog({
        cli: () => locateCodexCli(),
        version: '0.0.0',
        cwd: project,
      })
      const [latest] = await catalog.history(project, new Set())

      if (latest) {
        const page = await catalog.turns(latest.sessionId, null)
        const { items } = replayTurns(page.turns.toReversed(), 'p1-', () => '')

        console.info(
          '[codex live] turns',
          page.turns.length,
          'items',
          items.map((item) => item.kind).join(' '),
        )
        expect(page.turns.length).toBeGreaterThan(0)
        expect(items.some((item) => item.kind === 'user')).toBe(true)
      }

      await catalog.dispose()
    }, 60_000)

    it('вход через ChatGPT начинается ссылкой и отменяется - на пустой папке Codex', async () => {
      const home = await mkdtemp(join(homedir(), 'aw-codex-home-'))
      const cli = await locateCodexCli()
      const catalog = new CodexCatalog({
        cli: () => Promise.resolve(cli && { ...cli, env: { ...cli.env, CODEX_HOME: home } }),
        version: '0.0.0',
        cwd: homedir(),
      })

      try {
        expect(await catalog.account()).toBeNull()

        const login = await catalog.startSignIn()

        expect(login?.authUrl).toMatch(/^https:\/\//)
        await catalog.cancelSignIn(login?.loginId ?? '')
      } finally {
        await catalog.dispose()
        await rm(home, { recursive: true, force: true })
      }
    }, 60_000)
  },
)

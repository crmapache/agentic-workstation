import { rm, chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { AcpSignInStep } from '@shared/accounts'

import type { SignInEnd } from './acp-sign-in'
import { AcpSignIn } from './acp-sign-in'

/** Вход `agy acp --login`: адрес Google, потом ждёт код в stdin (вывод снят с `agy` 1.5.12). */
const FAKE_AGY = `#!/usr/bin/env node
process.stdout.write('Open this link in a browser to log in with Google:\\n\\n  https://accounts.google.com/o/oauth2/auth?client_id=x&state=y\\n\\nThen paste the authorization code, or the full URL of the page you land on, and press Enter:\\n')
process.stdin.once('data', (data) => {
  const code = String(data).trim()
  if (code !== '4/abc') { process.stdout.write('login failed\\n'); process.exit(1) }
  process.stdout.write('Logged in as mzpizote@gmail.com.\\n')
  process.exit(0)
})
`

/** Вход `kimi login`: открывает страницу сам, печатает адрес и код устройства (Kimi 2.7.0). */
const FAKE_KIMI = `#!/usr/bin/env node
process.stdout.write('Opening browser for Kimi device login: https://www.kimi.ai/code/authorize_device?user_code=0CQM-7010\\n')
process.stdout.write('If the browser did not open, paste the URL above and enter code: 0CQM-7010\\n')
process.stdout.write('Waiting for authorization to complete…\\n')
setTimeout(() => process.exit(0), 200)
`

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'acp-sign-in-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const script = async (name: string, body: string) => {
  const path = join(dir, name)

  await writeFile(path, body)
  await chmod(path, 0o755)

  return path
}

/** Адрес входа у поддельных CLI - как у настоящих: Google у `agy`, страница устройства у Kimi. */
const URL = /https:\/\/(accounts\.google\.com|www\.kimi\.ai)\/\S+/

const run = (binary: string, needsCode: boolean, code = '') =>
  new Promise<{ steps: (AcpSignInStep | null)[]; end: SignInEnd }>((resolve) => {
    const steps: (AcpSignInStep | null)[] = []
    const flow = new AcpSignIn(
      (step) => {
        steps.push(step)
        if (step?.needsCode && code) flow.submitCode(code)
      },
      (end) => resolve({ steps, end }),
    )

    flow.start(
      { binary, version: '', env: process.env as Record<string, string> },
      { args: [], env: {}, needsCode, urlPattern: URL },
    )
  })

describe('вход в агента ACP силами его CLI', () => {
  it('agy: адрес страницы, код человека в stdin, кто вошёл', async () => {
    const { steps, end } = await run(await script('agy', FAKE_AGY), true, '4/abc')

    expect(steps[0]).toEqual({
      url: 'https://accounts.google.com/o/oauth2/auth?client_id=x&state=y',
      userCode: '',
      needsCode: true,
      opened: false,
    })
    expect(end).toEqual({ outcome: 'landed', account: 'mzpizote@gmail.com' })
  })

  it('kimi: адрес и код устройства, страницу CLI открыл сам', async () => {
    const { steps, end } = await run(await script('kimi', FAKE_KIMI), false)

    expect(steps.find(Boolean)).toEqual({
      url: 'https://www.kimi.ai/code/authorize_device?user_code=0CQM-7010',
      userCode: '0CQM-7010',
      needsCode: false,
      opened: true,
    })
    expect(end.outcome).toBe('landed')
  })

  it('неверный код - вход не вышел', async () => {
    const { end } = await run(await script('agy', FAKE_AGY), true, 'wrong')

    expect(end.outcome).toBe('sign-in-failed')
  })
})

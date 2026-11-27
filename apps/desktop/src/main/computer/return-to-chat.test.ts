import { it, expect, describe } from 'vitest'

import { returnToChat } from './return-to-chat'
import type { ChatPlace, ChatReturnPorts } from './return-to-chat'

const ports = (place: ChatPlace | null, isWanted = true) => {
  const steps: string[] = []
  const port: ChatReturnPorts = {
    isWanted: () => isWanted,
    find: () => place,
    openProject: (path) => {
      steps.push(`project ${path}`)

      return Promise.resolve()
    },
    activate: (provider, key) => steps.push(`tab ${provider} ${key}`),
    showPanel: (provider) => steps.push(`panel ${provider}`),
    raise: () => steps.push('raise'),
  }

  return { port, steps }
}

describe('return to the chat', () => {
  it('opens the project, its tab and the panel, and only then raises the window', async () => {
    const { port, steps } = ports({ provider: 'codex', projectPath: '/work/site' })

    await expect(returnToChat('tab-1', port)).resolves.toBe(true)
    expect(steps).toEqual(['project /work/site', 'tab codex tab-1', 'panel codex', 'raise'])
  })

  it('a scenario or a task has no chat tab: the window stays where it is', async () => {
    const { port, steps } = ports(null)

    await expect(returnToChat('run-1', port)).resolves.toBe(false)
    expect(steps).toEqual([])
  })

  it('the user turned it off in Settings: the window stays where it is', async () => {
    const { port, steps } = ports({ provider: 'claude', projectPath: '/work/site' }, false)

    await expect(returnToChat('tab-1', port)).resolves.toBe(false)
    expect(steps).toEqual([])
  })
})

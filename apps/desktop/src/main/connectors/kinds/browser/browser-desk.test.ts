import { it, vi, expect, describe } from 'vitest'

import { BrowserDesk } from './browser-desk'
import type { BridgeControl } from './browser-desk'

const setup = () => {
  const connectors: { kind: string; enabled: boolean }[] = []
  const runtime = {
    enable: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    state: vi.fn<BridgeControl['state']>(),
    stop: vi.fn(() => Promise.resolve()),
  }
  const desk = new BrowserDesk(runtime, { connectors })

  return { desk, runtime, connectors }
}

describe('коннектор Browser и мост в Chrome', () => {
  it('на старте без коннектора остатки прошлых запусков убираются, и только раз', () => {
    const { desk, runtime } = setup()

    desk.sync()
    desk.sync()

    expect(runtime.remove).toHaveBeenCalledOnce()
    expect(runtime.enable).not.toHaveBeenCalled()
  })

  it('удалённый выключенный коннектор всё равно убирает мост', () => {
    const { desk, runtime, connectors } = setup()

    connectors.push({ kind: 'browser', enabled: true })
    desk.sync()
    connectors[0]!.enabled = false
    desk.sync()

    expect(runtime.enable).toHaveBeenCalledOnce()
    expect(runtime.remove).not.toHaveBeenCalled()

    connectors.length = 0
    desk.sync()

    expect(runtime.remove).toHaveBeenCalledOnce()
  })

  it('выключенный на старте коннектор моста не трогает; включили - мост ставится', () => {
    const { desk, runtime, connectors } = setup()

    connectors.push({ kind: 'browser', enabled: false })
    desk.sync()

    expect(runtime.enable).not.toHaveBeenCalled()
    expect(runtime.remove).not.toHaveBeenCalled()

    connectors[0]!.enabled = true
    desk.sync()
    desk.sync()

    expect(runtime.enable).toHaveBeenCalledOnce()
  })

  it('удалили и добавили снова - мост ставится заново', () => {
    const { desk, runtime, connectors } = setup()

    connectors.push({ kind: 'browser', enabled: true })
    desk.sync()
    connectors.length = 0
    desk.sync()
    connectors.push({ kind: 'browser', enabled: true })
    desk.sync()

    expect(runtime.enable).toHaveBeenCalledTimes(2)
    expect(runtime.remove).toHaveBeenCalledOnce()
  })
})

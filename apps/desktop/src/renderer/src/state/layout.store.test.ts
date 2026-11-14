import { it, expect, describe, beforeEach } from 'vitest'

import { isMainShown, useLayoutStore, isSidePanelShown } from './layout.store'

beforeEach(() =>
  useLayoutStore.setState({
    side: { activeViewId: 'files', isOpen: true, width: 280 },
    main: { activeViewId: 'file', isOpen: true },
    provider: { activeViewId: 'claude-code', isOpen: true, width: 520 },
    terminal: { isOpen: false, share: 0.5 },
    room: 1252,
  }),
)

describe('середина, которой не хватает места', () => {
  it('сворачивается сама, когда место ушло, и возвращается, когда пришло', () => {
    useLayoutStore.getState().setRoom(1000)
    expect(isMainShown(useLayoutStore.getState())).toBe(false)

    useLayoutStore.getState().setRoom(1252)
    expect(isMainShown(useLayoutStore.getState())).toBe(true)
  })

  it('клик по её иконке не сворачивает её, а ужимает панели и показывает', () => {
    useLayoutStore.getState().setRoom(1000)
    useLayoutStore.getState().selectMainView('file')

    const state = useLayoutStore.getState()

    expect(state.main).toEqual({ activeViewId: 'file', isOpen: true })
    // Место 1000: середине 308, левой - ещё её зазор 8.
    expect(state.side.width + state.provider.width).toBeLessThanOrEqual(684)
    expect(isMainShown(state)).toBe(true)
  })

  it('показанную клик по той же иконке сворачивает, панели не трогает', () => {
    useLayoutStore.getState().selectMainView('file')

    const state = useLayoutStore.getState()

    expect(state.main.isOpen).toBe(false)
    expect(state.side.width).toBe(280)
    expect(state.provider.width).toBe(520)
  })

  it('в узком окне клик по иконке сворачивает панели, иконка разговора возвращает его', () => {
    useLayoutStore.getState().setRoom(400)
    useLayoutStore.getState().selectMainView('file')

    const state = useLayoutStore.getState()

    expect(state.side.isOpen).toBe(false)
    expect(state.provider.isOpen).toBe(false)
    expect(isMainShown(state)).toBe(true)

    useLayoutStore.getState().selectProviderView('claude-code')
    expect(isMainShown(useLayoutStore.getState())).toBe(false)
  })

  it('в узком окне левая панель прячется за разговором, её иконка меняет их местами', () => {
    useLayoutStore.getState().setRoom(400)
    expect(isSidePanelShown(useLayoutStore.getState())).toBe(false)

    useLayoutStore.getState().selectSideView('files')
    expect(useLayoutStore.getState().provider.isOpen).toBe(false)
    expect(isSidePanelShown(useLayoutStore.getState())).toBe(true)

    useLayoutStore.getState().selectProviderView('claude-code')
    expect(useLayoutStore.getState().side.isOpen).toBe(true)
    expect(isSidePanelShown(useLayoutStore.getState())).toBe(false)
  })

  it('свёрнутая человеком не возвращается сама, сколько бы места ни пришло', () => {
    useLayoutStore.getState().selectMainView('file')
    useLayoutStore.getState().setRoom(3000)

    expect(isMainShown(useLayoutStore.getState())).toBe(false)
  })
})

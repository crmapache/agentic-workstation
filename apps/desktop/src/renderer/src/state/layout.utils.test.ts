import { it, expect, describe } from 'vitest'

import type { Layout } from './layout.types'
import {
  arrangeLayout,
  resizedPanels,
  restoreLayout,
  terminalHeight,
  makeRoomForMain,
  resizedTerminalShare,
} from './layout.utils'

const defaults: Layout = {
  side: { activeViewId: 'files', isOpen: true, width: 280 },
  main: { activeViewId: 'file', isOpen: true },
  provider: { activeViewId: 'claude-code', isOpen: true, width: 440 },
  terminal: { isOpen: false, share: 0.5 },
}

describe('restoreLayout', () => {
  it('берёт сохранённое, если вид ещё существует', () => {
    const saved = {
      side: { activeViewId: 'files', isOpen: false, width: 320 },
      main: { activeViewId: 'statistics', isOpen: false },
      provider: { activeViewId: 'claude-code', isOpen: false, width: 500 },
      terminal: { isOpen: true, share: 0.3 },
    }

    expect(restoreLayout(saved, defaults)).toEqual(saved)
  })

  it('удалённый вид заменяет видом по умолчанию, остальное сохраняет', () => {
    const saved = {
      side: { activeViewId: 'search', isOpen: true, width: 300 },
      main: { activeViewId: 'terminal', isOpen: false },
    }

    const restored = restoreLayout(saved, defaults)

    expect(restored.side).toEqual({ activeViewId: 'files', isOpen: true, width: 300 })
    expect(restored.main).toEqual({ activeViewId: 'file', isOpen: false })
  })

  it('раскладка от версии без видов середины открывает файл', () => {
    const saved = {
      side: { activeViewId: 'files', isOpen: true, width: 300 },
      provider: { activeViewId: 'claude-code', isOpen: true, width: 500 },
    }

    expect(restoreLayout(saved, defaults).main).toEqual({ activeViewId: 'file', isOpen: true })
  })

  it('ширину уже минимума ставит на минимум, шире - не трогает', () => {
    const saved = {
      side: { activeViewId: 'files', isOpen: true, width: 40 },
      provider: { activeViewId: 'claude-code', isOpen: true, width: 4000 },
    }
    const restored = restoreLayout(saved, defaults)

    expect(restored.side.width).toBe(180)
    expect(restored.provider.width).toBe(4000)
  })

  it('битое или пустое сохранённое - раскладка по умолчанию', () => {
    expect(restoreLayout(undefined, defaults)).toEqual(defaults)
    expect(
      restoreLayout(
        { side: 'oops', main: 7, provider: { width: '1' }, terminal: { share: 1 } },
        defaults,
      ),
    ).toEqual(defaults)
  })
})

// Минимумы из layout.constants: левая 180, правая 300, место середины 308 (лист и зазор).
const wide: Layout = {
  side: { activeViewId: 'files', isOpen: true, width: 280 },
  main: { activeViewId: 'file', isOpen: true },
  provider: { activeViewId: 'claude-code', isOpen: true, width: 520 },
  terminal: { isOpen: false, share: 0.5 },
}

describe('arrangeLayout', () => {
  it('места хватает - панели своей ширины, середине остаток', () => {
    expect(arrangeLayout(wide, 1252)).toEqual({
      side: 280,
      provider: 520,
      main: 452,
      isMainShown: true,
    })
  })

  it('месту середины меньше 308 - она не видна, но развёрнутой остаётся', () => {
    expect(arrangeLayout(wide, 1107)).toMatchObject({ main: 307, isMainShown: false })
    expect(arrangeLayout(wide, 1108)).toMatchObject({ main: 308, isMainShown: true })
  })

  it('свёрнутая человеком середина не видна и при месте', () => {
    const collapsed = { ...wide, main: { ...wide.main, isOpen: false } }

    expect(arrangeLayout(collapsed, 2000).isMainShown).toBe(false)
  })

  it('окно уже панелей - обе отдают одну долю лишнего над минимумом, середине ноль', () => {
    // Лишних 100: у левой над минимумом 100, у правой 220 - обе отдают по 31.25%.
    expect(arrangeLayout(wide, 700)).toEqual({
      side: 248.75,
      provider: 451.25,
      main: 0,
      isMainShown: false,
    })
  })

  it('ниже минимума панели не ужимаются', () => {
    expect(arrangeLayout(wide, 400)).toMatchObject({ side: 180, provider: 300, main: 0 })
  })

  it('свёрнутая панель места не занимает и своей ширины не теряет', () => {
    const noTree = { ...wide, side: { ...wide.side, isOpen: false } }

    expect(arrangeLayout(noTree, 828)).toEqual({
      side: 280,
      provider: 520,
      main: 308,
      isMainShown: true,
    })
  })

  it('правая колонка с одним терминалом занимает место, как открытая панель', () => {
    const terminalOnly = {
      ...wide,
      provider: { ...wide.provider, isOpen: false },
      terminal: { isOpen: true, share: 0.5 },
    }

    expect(arrangeLayout(terminalOnly, 1252)).toMatchObject({ provider: 520, main: 452 })
  })

  it('до первого замера ничего не ужимается и не сворачивается', () => {
    expect(arrangeLayout(wide, Number.POSITIVE_INFINITY)).toMatchObject({
      side: 280,
      provider: 520,
      isMainShown: true,
    })
  })
})

describe('makeRoomForMain', () => {
  it('места хватает - панели не трогает', () => {
    const panels = makeRoomForMain(wide, 1252)

    expect(panels.side).toBe(wide.side)
    expect(panels.provider).toBe(wide.provider)
  })

  it('ужимает панели ровно на недостающее середине, целыми пикселями', () => {
    const panels = makeRoomForMain(wide, 1000)

    expect(panels.side.width).toBe(246)
    expect(panels.provider.width).toBe(445)
    expect(arrangeLayout({ ...wide, ...panels }, 1000)).toMatchObject({
      main: 309,
      isMainShown: true,
    })
  })

  it('в самом узком окне обе панели на минимуме дают середине ровно её предел', () => {
    // Окно 968: место под панели и середину - 968 - 180 = 788.
    const panels = makeRoomForMain(wide, 788)

    expect(panels.side.width).toBe(180)
    expect(panels.provider.width).toBe(300)
    expect(arrangeLayout({ ...wide, ...panels }, 788).isMainShown).toBe(true)
  })

  it('свёрнутую панель не трогает - места просит открытая', () => {
    const noTree = { ...wide, side: { ...wide.side, isOpen: false } }
    const panels = makeRoomForMain(noTree, 700)

    expect(panels.side).toBe(noTree.side)
    expect(panels.provider.width).toBe(392)
  })
})

describe('resizedPanels', () => {
  it('панель растёт только в место середины, соседняя не меняется', () => {
    // Середине остаётся 200: дальше этого панель не вырастет.
    expect(resizedPanels(wide, 1000, 'side', 50).side.width).toBe(330)
    expect(resizedPanels(wide, 1000, 'side', 300).side.width).toBe(480)
    expect(resizedPanels(wide, 1000, 'provider', 300).side).toBe(wide.side)
  })

  it('растёт и в пустую раму свёрнутой середины - до самой полосы, без щели', () => {
    const collapsed = { ...wide, main: { ...wide.main, isOpen: false } }
    const panels = resizedPanels(collapsed, 1000, 'provider', 500)

    expect(panels.provider.width).toBe(720)
    expect(arrangeLayout({ ...collapsed, ...panels }, 1000).main).toBe(0)
  })

  it('потолка нет: в широком окне панель растёт, пока есть место середины', () => {
    expect(resizedPanels(wide, 3000, 'provider', 1500).provider.width).toBe(2020)
  })

  it('ужатая узким окном панель меняется от ширины на экране', () => {
    expect(resizedPanels(wide, 700, 'side', -10).side.width).toBe(238.75)
    expect(resizedPanels(wide, 700, 'side', 10).side.width).toBe(248.75)
  })

  it('уже минимума не ужимается', () => {
    expect(resizedPanels(wide, 1252, 'side', -500).side.width).toBe(180)
  })
})

// Минимумы из layout.constants: терминал 250, панель над ним 250.
describe('terminalHeight', () => {
  it('своя доля, пока обоим хватает их минимума', () => {
    expect(terminalHeight(0.5, 800)).toBe(400)
    expect(terminalHeight(0.1, 800)).toBe(250)
    expect(terminalHeight(0.9, 800)).toBe(550)
  })

  it('колонке не хватает на оба минимума - пополам', () => {
    expect(terminalHeight(0.2, 450)).toBe(225)
  })
})

describe('resizedTerminalShare', () => {
  it('ручка вверх растит терминал, но не дальше минимума панели над ним', () => {
    expect(resizedTerminalShare(0.5, 800, -100)).toBe(0.625)
    expect(resizedTerminalShare(0.5, 800, -1000)).toBe(550 / 800)
  })

  it('ручка вниз - терминал ниже, но не ниже своего минимума', () => {
    expect(resizedTerminalShare(0.5, 800, 1000)).toBe(250 / 800)
  })
})

import { it, expect, describe } from 'vitest'

import type { Layout } from './layout.types'
import {
  arrangeLayout,
  resizedPanels,
  restoreLayout,
  terminalHeight,
  makeRoomForMain,
  makeRoomForSide,
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

// Минимумы из layout.constants: левая 180 и зазор за ней 8, правая 250, место середины 308
// (лист и зазор). Левая с зазором - 288, обе панели своей ширины - 808.
const wide: Layout = {
  side: { activeViewId: 'files', isOpen: true, width: 280 },
  main: { activeViewId: 'file', isOpen: true },
  provider: { activeViewId: 'claude-code', isOpen: true, width: 520 },
  terminal: { isOpen: false, share: 0.5 },
}
const noTree: Layout = { ...wide, side: { ...wide.side, isOpen: false } }

describe('arrangeLayout', () => {
  it('места хватает - панели своей ширины, середине остаток', () => {
    expect(arrangeLayout(wide, 1260)).toEqual({
      side: 280,
      provider: 520,
      main: 452,
      isSideShown: true,
      isMainShown: true,
    })
  })

  it('месту середины меньше 308 - она не видна, но развёрнутой остаётся', () => {
    expect(arrangeLayout(wide, 1115).isMainShown).toBe(false)
    expect(arrangeLayout(wide, 1116)).toMatchObject({ main: 308, isMainShown: true })
  })

  it('место не видной середины забирает правая колонка, своя ширина у неё та же', () => {
    expect(arrangeLayout(wide, 1115)).toEqual({
      side: 280,
      provider: 827,
      main: 0,
      isSideShown: true,
      isMainShown: false,
    })
  })

  it('правая колонка с одним терминалом тоже забирает место середины', () => {
    const terminalOnly = {
      ...wide,
      provider: { ...wide.provider, isOpen: false },
      terminal: { isOpen: true, share: 0.5 },
    }

    expect(arrangeLayout(terminalOnly, 1115)).toMatchObject({ provider: 827, main: 0 })
  })

  it('свёрнутая правая колонка места середины не забирает - там пустая рама', () => {
    const noProvider = { ...wide, provider: { ...wide.provider, isOpen: false } }

    expect(arrangeLayout(noProvider, 500)).toMatchObject({
      side: 280,
      main: 212,
      isSideShown: true,
      isMainShown: false,
    })
  })

  it('свёрнутая человеком середина не видна и при месте', () => {
    const collapsed = { ...wide, main: { ...wide.main, isOpen: false } }

    expect(arrangeLayout(collapsed, 2000).isMainShown).toBe(false)
  })

  it('свёрнутую человеком середину панели не забирают - пустая рама, панели на местах', () => {
    const collapsed = { ...wide, main: { ...wide.main, isOpen: false } }

    expect(arrangeLayout(collapsed, 1008)).toMatchObject({ provider: 520, main: 200 })
  })

  it('окно уже панелей - обе отдают одну долю лишнего над минимумом, середине ноль', () => {
    // Лишних 37: у левой над минимумом 100, у правой 270 - обе отдают по 10%.
    expect(arrangeLayout(wide, 771)).toEqual({
      side: 270,
      provider: 493,
      main: 0,
      isSideShown: true,
      isMainShown: false,
    })
  })

  it('левой нет места рядом с разговором на минимумах - она прячется, разговор её место берёт', () => {
    expect(arrangeLayout(wide, 438)).toMatchObject({ side: 180, provider: 250, isSideShown: true })
    expect(arrangeLayout(wide, 437)).toMatchObject({
      provider: 437,
      isSideShown: false,
      isMainShown: false,
    })
  })

  it('без правой колонки левая не прячется', () => {
    const noProvider = { ...wide, provider: { ...wide.provider, isOpen: false } }

    expect(arrangeLayout(noProvider, 250)).toMatchObject({ side: 242, isSideShown: true })
  })

  it('в самом узком окне разговор один занимает всё место - свои 250', () => {
    expect(arrangeLayout(noTree, 250)).toMatchObject({ provider: 250, isMainShown: false })
  })

  it('место уже предела середины - она видна, когда ей отдано всё место', () => {
    const mainOnly = { ...noTree, provider: { ...wide.provider, isOpen: false } }

    expect(arrangeLayout(mainOnly, 250)).toMatchObject({ main: 250, isMainShown: true })
  })

  it('свёрнутая панель места не занимает и своей ширины не теряет', () => {
    expect(arrangeLayout(noTree, 828)).toEqual({
      side: 280,
      provider: 520,
      main: 308,
      isSideShown: false,
      isMainShown: true,
    })
  })

  it('правая колонка с одним терминалом занимает место, как открытая панель', () => {
    const terminalOnly = {
      ...wide,
      provider: { ...wide.provider, isOpen: false },
      terminal: { isOpen: true, share: 0.5 },
    }

    expect(arrangeLayout(terminalOnly, 1260)).toMatchObject({ provider: 520, main: 452 })
  })

  it('до первого замера ничего не ужимается и не сворачивается', () => {
    expect(arrangeLayout(wide, Number.POSITIVE_INFINITY)).toMatchObject({
      side: 280,
      provider: 520,
      isSideShown: true,
      isMainShown: true,
    })
  })
})

describe('makeRoomForMain', () => {
  it('места хватает - панели не трогает', () => {
    const panels = makeRoomForMain(wide, 1260)

    expect(panels.side).toBe(wide.side)
    expect(panels.provider).toBe(wide.provider)
    expect(panels.terminal).toBe(wide.terminal)
  })

  it('ужимает панели ровно на недостающее середине, целыми пикселями', () => {
    const panels = makeRoomForMain(wide, 1008)

    expect(panels.side.width).toBe(250)
    expect(panels.provider.width).toBe(441)
    expect(arrangeLayout({ ...wide, ...panels }, 1008)).toMatchObject({
      main: 309,
      isMainShown: true,
    })
  })

  it('обе панели на минимуме дают середине ровно её предел, если места на это хватает', () => {
    // 180 + 8 + 250 + 308 = 746.
    const panels = makeRoomForMain(wide, 746)

    expect(panels.side.width).toBe(180)
    expect(panels.provider.width).toBe(250)
    expect(arrangeLayout({ ...wide, ...panels }, 746).isMainShown).toBe(true)
  })

  it('свёрнутую панель не трогает - места просит открытая', () => {
    const panels = makeRoomForMain(noTree, 700)

    expect(panels.side).toBe(noTree.side)
    expect(panels.provider.width).toBe(392)
  })

  it('на минимумах обеих не хватает - сворачивает левую, правая уступает остальное', () => {
    const panels = makeRoomForMain(wide, 650)

    expect(panels.side).toEqual({ ...wide.side, isOpen: false })
    expect(panels.provider.width).toBe(342)
    expect(arrangeLayout({ ...wide, ...panels }, 650)).toMatchObject({
      main: 308,
      isMainShown: true,
    })
  })

  it('не хватает и одной правой на минимуме - сворачивает колонку вместе с терминалом', () => {
    const withTerminal = { ...wide, terminal: { isOpen: true, share: 0.5 } }
    const panels = makeRoomForMain(withTerminal, 500)

    expect(panels.side.isOpen).toBe(false)
    expect(panels.provider).toEqual({ ...wide.provider, isOpen: false })
    expect(panels.terminal.isOpen).toBe(false)
    expect(arrangeLayout({ ...withTerminal, ...panels }, 500)).toMatchObject({
      main: 500,
      isMainShown: true,
    })
  })

  it('левую, спрятанную узким окном, сворачивает вместе с правой колонкой', () => {
    // Иначе, когда колонка уйдёт, левая встанет на место середины.
    const panels = makeRoomForMain(wide, 437)

    expect(panels.side.isOpen).toBe(false)
    expect(panels.provider.isOpen).toBe(false)
    expect(arrangeLayout({ ...wide, ...panels }, 437)).toMatchObject({
      main: 437,
      isMainShown: true,
    })
  })

  it('в окне уже предела середины ей отдаётся всё место', () => {
    const panels = makeRoomForMain(noTree, 250)

    expect(panels.provider.isOpen).toBe(false)
    expect(arrangeLayout({ ...noTree, ...panels }, 250).isMainShown).toBe(true)
  })
})

describe('makeRoomForSide', () => {
  it('левая влезает рядом с правой колонкой - ничего не трогает', () => {
    const panels = makeRoomForSide(noTree, 1260)

    expect(panels.provider).toBe(noTree.provider)
    expect(panels.terminal).toBe(noTree.terminal)
  })

  it('не влезает - правая колонка уступает целиком, вместе с терминалом', () => {
    const withTerminal = { ...wide, terminal: { isOpen: true, share: 0.5 } }
    const panels = makeRoomForSide(withTerminal, 437)

    expect(panels.provider.isOpen).toBe(false)
    expect(panels.terminal.isOpen).toBe(false)
    expect(arrangeLayout({ ...withTerminal, ...panels }, 437).isSideShown).toBe(true)
  })
})

describe('resizedPanels', () => {
  it('панель растёт только в место середины, соседняя не меняется', () => {
    // Середине остаётся 200: дальше этого панель не вырастет.
    expect(resizedPanels(wide, 1008, 'side', 50).side.width).toBe(330)
    expect(resizedPanels(wide, 1008, 'side', 300).side.width).toBe(480)
    expect(resizedPanels(wide, 1008, 'provider', 300).side).toBe(wide.side)
  })

  it('растёт и в пустую раму свёрнутой середины - до самой полосы, без щели', () => {
    const collapsed = { ...wide, main: { ...wide.main, isOpen: false } }
    const panels = resizedPanels(collapsed, 1008, 'provider', 500)

    expect(panels.provider.width).toBe(720)
    expect(arrangeLayout({ ...collapsed, ...panels }, 1008).main).toBe(0)
  })

  it('потолка нет: в широком окне панель растёт, пока есть место середины', () => {
    expect(resizedPanels(wide, 3008, 'provider', 1500).provider.width).toBe(2020)
  })

  it('ужатая узким окном панель меняется от ширины на экране', () => {
    expect(resizedPanels(wide, 771, 'side', -10).side.width).toBe(260)
    expect(resizedPanels(wide, 771, 'side', 10).side.width).toBe(270)
  })

  it('уже минимума не ужимается', () => {
    expect(resizedPanels(wide, 1260, 'side', -500).side.width).toBe(180)
    expect(resizedPanels(wide, 1260, 'provider', -500).provider.width).toBe(250)
  })

  it('колонка, забравшая место середины, сужается от своей ширины, а не от экранной', () => {
    // На экране 827, своя - 520, середине 307: ещё 2 пикселя, и она вернётся.
    const panels = resizedPanels(wide, 1115, 'provider', -2)

    expect(panels.provider.width).toBe(518)
    expect(arrangeLayout({ ...wide, ...panels }, 1115)).toMatchObject({
      provider: 518,
      main: 309,
      isMainShown: true,
    })
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

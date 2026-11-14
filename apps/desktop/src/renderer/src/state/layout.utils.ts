import {
  SHEET_GAP,
  MAIN_VIEW_IDS,
  SIDE_VIEW_IDS,
  MAIN_MIN_WIDTH,
  PANEL_MIN_WIDTH,
  PROVIDER_VIEW_IDS,
  PROVIDER_MIN_HEIGHT,
  TERMINAL_MIN_HEIGHT,
} from './layout.constants'
import type {
  Layout,
  PanelSide,
  PanelState,
  Arrangement,
  ViewAreaState,
  TerminalDockState,
} from './layout.types'

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const restoreArea = <ViewId extends string>(
  saved: unknown,
  fallback: ViewAreaState<ViewId>,
  viewIds: readonly ViewId[],
): ViewAreaState<ViewId> => {
  const { activeViewId, isOpen } = asRecord(saved)

  return {
    activeViewId: viewIds.find((viewId) => viewId === activeViewId) ?? fallback.activeViewId,
    isOpen: typeof isOpen === 'boolean' ? isOpen : fallback.isOpen,
  }
}

/** Ширина не уже минимума панели (PANEL_MIN_WIDTH). */
const clampWidth = (side: PanelSide, width: number) => Math.max(PANEL_MIN_WIDTH[side], width)

const restorePanel = <ViewId extends string>(
  side: PanelSide,
  saved: unknown,
  fallback: PanelState<ViewId>,
  viewIds: readonly ViewId[],
): PanelState<ViewId> => {
  const { width } = asRecord(saved)

  return {
    ...restoreArea(saved, fallback, viewIds),
    width: typeof width === 'number' ? clampWidth(side, width) : fallback.width,
  }
}

/** Доля терминала - строго между нулём и единицей; иначе - по умолчанию. */
const restoreTerminal = (saved: unknown, fallback: TerminalDockState): TerminalDockState => {
  const { isOpen, share } = asRecord(saved)

  return {
    isOpen: typeof isOpen === 'boolean' ? isOpen : fallback.isOpen,
    share: typeof share === 'number' && share > 0 && share < 1 ? share : fallback.share,
  }
}

/**
 * Раскладка из localStorage поверх раскладки по умолчанию. Сохранённое пишет старая
 * версия окна: вид могли удалить (так ушёл вид «Search»), поле - потерять или ещё не
 * завести (середину окна до её видов не сохраняли). Такое заменяется значением по
 * умолчанию, иначе панель открылась бы пустой. Ширина уже нынешнего минимума встаёт на
 * минимум: на экране панель всё равно не уже его, и расчёт места с ней бы разошёлся.
 */
export const restoreLayout = (persisted: unknown, defaults: Layout): Layout => {
  const { side, main, provider, terminal } = asRecord(persisted)

  return {
    side: restorePanel('side', side, defaults.side, SIDE_VIEW_IDS),
    main: restoreArea(main, defaults.main, MAIN_VIEW_IDS),
    provider: restorePanel('provider', provider, defaults.provider, PROVIDER_VIEW_IDS),
    terminal: restoreTerminal(terminal, defaults.terminal),
  }
}

type Panels = Pick<Layout, PanelSide | 'terminal'>

/**
 * Стоит ли колонка панели на экране. Правая колонка - это GUI провайдера и терминал под
 * ним (ADR 0037): она видна, если открыт хоть один из них, и ширина у них общая.
 */
export const isPanelShown = (panels: Panels, side: PanelSide): boolean =>
  side === 'provider' ? panels.provider.isOpen || panels.terminal.isOpen : panels.side.isOpen

/**
 * Видна ли левая панель: развёрнута и влезает рядом с правой колонкой на их минимумах.
 * Правая главнее - минимум разговора держится всегда (просьба владельца), поэтому в узком
 * окне левая прячется, а развёрнутой остаётся: окно станет шире - вернётся.
 */
export const isSideShown = (panels: Panels, room: number): boolean =>
  panels.side.isOpen &&
  (!isPanelShown(panels, 'provider') ||
    room >= PANEL_MIN_WIDTH.side + SHEET_GAP + PANEL_MIN_WIDTH.provider)

/** Раскладка, где левая панель, которой нет места, считается свёрнутой. */
const onScreen = <Shape extends Panels>(panels: Shape, room: number): Shape => ({
  ...panels,
  side: { ...panels.side, isOpen: isSideShown(panels, room) },
})

/** Сколько панель может отдать: всё сверх минимума. Свёрнутая не отдаёт ничего. */
const spare = (panels: Panels, side: PanelSide) =>
  isPanelShown(panels, side) ? Math.max(0, panels[side].width - PANEL_MIN_WIDTH[side]) : 0

/**
 * Сколько места занимает панель: свёрнутая - ничего. Место левой - её ширина и зазор за
 * ней: спрятанная, она отдаёт и зазор (замер места в Workbench.hooks.ts считает так же).
 */
const occupied = (panels: Panels, side: PanelSide, width: number) => {
  if (!isPanelShown(panels, side)) return 0

  return side === 'side' ? width + SHEET_GAP : width
}

/**
 * Ширины панелей, ужатых на excess пикселей: каждая отдаёт одну и ту же долю того, что
 * у неё сверх минимума, поэтому ниже минимума не уходит ни одна. Не хватило - обе на
 * минимуме. У свёрнутой ширина та, что была.
 */
const shrinkPanels = (panels: Panels, excess: number): Record<PanelSide, number> => {
  const total = spare(panels, 'side') + spare(panels, 'provider')
  const share = total > 0 ? Math.min(1, Math.max(0, excess) / total) : 0

  return {
    side: panels.side.width - spare(panels, 'side') * share,
    provider: panels.provider.width - spare(panels, 'provider') * share,
  }
}

/**
 * Сколько места надо середине, чтобы её показать: MAIN_MIN_WIDTH, а в окне, где всего места
 * меньше, - всё место. Иначе в узком окне середину было бы не показать никак.
 */
const mainNeed = (room: number) => Math.min(MAIN_MIN_WIDTH, room)

/**
 * Ширины, которые видимые панели берут сами, без места свёрнутой середины: сохранённые,
 * ужатые до минимумов. Середине - остаток. От них, а не от ширины на экране, считают
 * ручки и просьба показать середину: правая колонка, забравшая место середины, своей
 * ширины не меняла.
 */
const fitLayout = (panels: Panels, room: number): Record<PanelSide | 'main', number> => {
  const excess =
    occupied(panels, 'side', panels.side.width) +
    occupied(panels, 'provider', panels.provider.width) -
    room
  const widths = shrinkPanels(panels, excess)
  const main = Math.max(
    0,
    room - occupied(panels, 'side', widths.side) - occupied(panels, 'provider', widths.provider),
  )

  return { ...widths, main }
}

/**
 * Раскладка на месте room - ширине, которую делят середина и правая колонка, и левая
 * панель вместе с зазором за ней. Панели берут сохранённую ширину, а если окну её не
 * хватает - ужимаются, но сохранённую не трогают: окно станет шире, и они вернутся. Левой
 * нет места рядом с правой на минимумах - она не видна (isSideShown). Середине - остаток;
 * меньше MAIN_MIN_WIDTH - она не видна, и её место забирает правая колонка (разговор и
 * терминал), а не пустая рама. Свёрнутая человеком середина - пустая рама, панели на своих
 * местах (ADR 0015).
 */
export const arrangeLayout = (layout: Layout, room: number): Arrangement => {
  const shown = onScreen(layout, room)
  const fit = fitLayout(shown, room)
  const isMainShown = layout.main.isOpen && fit.main >= mainNeed(room)
  const fills = layout.main.isOpen && !isMainShown && isPanelShown(shown, 'provider')

  return {
    side: fit.side,
    provider: fills ? fit.provider + fit.main : fit.provider,
    main: fills ? 0 : fit.main,
    isSideShown: shown.side.isOpen,
    isMainShown,
  }
}

/** Открытая панель с новой шириной в целых пикселях; свёрнутая - как была. */
const fitted = <Panel extends PanelState<string>>(
  panel: Panel,
  width: number,
  isShown: boolean,
): Panel => (isShown ? { ...panel, width: Math.floor(width) } : panel)

/**
 * Панели, освободившие середине место (MAIN_MIN_WIDTH, в окне уже него - всё): человек
 * попросил показать её (иконка, выбор файла), а места нет. Ужимаются ровно на недостающее,
 * от своей ширины, и новая ширина сохраняется. Целые пиксели вниз - чтобы середина точно
 * не осталась на долю пикселя короче предела. Не хватает и на минимумах (узкое окно) -
 * панели уступают целиком: сначала левая, потом правая колонка, и с ней левая, даже
 * спрятанная, - иначе она встала бы на освобождённое место. Вернуть их - их иконкой.
 */
export const makeRoomForMain = (
  layout: Layout,
  room: number,
): Pick<Layout, PanelSide | 'terminal'> => {
  const shown = onScreen(layout, room)
  const need = mainNeed(room)
  const fit = fitLayout(shown, room)
  const unchanged = { side: layout.side, provider: layout.provider, terminal: layout.terminal }

  if (fit.main >= need) return unchanged

  const widths = shrinkPanels(
    {
      side: { ...shown.side, width: fit.side },
      provider: { ...shown.provider, width: fit.provider },
      terminal: shown.terminal,
    },
    need - fit.main,
  )
  const shrunk = {
    side: fitted(layout.side, widths.side, isPanelShown(shown, 'side')),
    provider: fitted(layout.provider, widths.provider, isPanelShown(shown, 'provider')),
    terminal: layout.terminal,
  }

  if (fitLayout(onScreen({ ...layout, ...shrunk }, room), room).main >= need) return shrunk

  if (isPanelShown(shown, 'side')) {
    return makeRoomForMain({ ...layout, side: { ...layout.side, isOpen: false } }, room)
  }

  return {
    side: { ...layout.side, isOpen: false },
    provider: { ...layout.provider, isOpen: false },
    terminal: { ...layout.terminal, isOpen: false },
  }
}

/**
 * Правая колонка, уступившая место левой панели: человек попросил показать левую, а рядом
 * с колонкой на минимумах ей места нет (узкое окно). Колонка сворачивается вместе с
 * терминалом - вернуть её иконкой, и тогда спрячется левая. Места хватает - без изменений.
 */
export const makeRoomForSide = (
  layout: Layout,
  room: number,
): Pick<Layout, 'provider' | 'terminal'> =>
  isSideShown({ ...layout, side: { ...layout.side, isOpen: true } }, room)
    ? { provider: layout.provider, terminal: layout.terminal }
    : {
        provider: { ...layout.provider, isOpen: false },
        terminal: { ...layout.terminal, isOpen: false },
      }

/**
 * Панели после сдвига ручки одной из них на delta пикселей. Отсчёт - от ширины, которую
 * панель берёт сама, а не сохранённой: ужатая узким окном панель отзывается на ручку
 * сразу. Расти можно в место середины, развёрнутой или нет, до самой полосы иконок - без
 * щели между ними. Дальше панель вытолкнула бы соседнюю за край окна. Правая колонка,
 * забравшая место развёрнутой середины, сужается от своей ширины: середина вернётся,
 * когда ей хватит места, а до тех пор колонка так и стоит до полосы.
 */
export const resizedPanels = (
  layout: Layout,
  room: number,
  side: PanelSide,
  delta: number,
): Pick<Layout, PanelSide> => {
  const fit = fitLayout(onScreen(layout, room), room)
  const width = clampWidth(side, fit[side] + Math.min(delta, fit.main))

  return {
    side: side === 'side' ? { ...layout.side, width } : layout.side,
    provider: side === 'provider' ? { ...layout.provider, width } : layout.provider,
  }
}

/**
 * Высота терминала в колонке высотой room (без зазора между листами): его доля, но не ниже
 * TERMINAL_MIN_HEIGHT и не выше, чем оставит панели над ним PROVIDER_MIN_HEIGHT. Колонке не
 * хватает на оба минимума - пополам.
 */
export const terminalHeight = (share: number, room: number): number => {
  const max = room - PROVIDER_MIN_HEIGHT

  if (max < TERMINAL_MIN_HEIGHT) return Math.round(room / 2)

  return Math.min(max, Math.max(TERMINAL_MIN_HEIGHT, Math.round(share * room)))
}

/**
 * Доля терминала после сдвига ручки на delta пикселей (вниз - плюс, терминал ниже). Отсчёт
 * от высоты на экране, в тех же пределах, что и terminalHeight.
 */
export const resizedTerminalShare = (share: number, room: number, delta: number): number =>
  room > 0 ? terminalHeight((terminalHeight(share, room) - delta) / room, room) / room : share

import {
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

/** Сколько панель может отдать: всё сверх минимума. Свёрнутая не отдаёт ничего. */
const spare = (panels: Panels, side: PanelSide) =>
  isPanelShown(panels, side) ? Math.max(0, panels[side].width - PANEL_MIN_WIDTH[side]) : 0

/** Сколько занимает панель на экране: свёрнутая - ничего. */
const occupied = (panels: Panels, side: PanelSide, width: number) =>
  isPanelShown(panels, side) ? width : 0

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
 * Раскладка на месте room - ширине, которую делят левая панель, середина и правая
 * панель. Панели берут сохранённую ширину, а если окну её не хватает - ужимаются, но
 * сохранённую не трогают: окно станет шире, и они вернутся. Середине - остаток; меньше
 * MAIN_MIN_WIDTH - она не видна, на её месте пустая рама.
 */
export const arrangeLayout = (layout: Layout, room: number): Arrangement => {
  const excess =
    occupied(layout, 'side', layout.side.width) +
    occupied(layout, 'provider', layout.provider.width) -
    room
  const widths = shrinkPanels(layout, excess)
  const main = Math.max(
    0,
    room - occupied(layout, 'side', widths.side) - occupied(layout, 'provider', widths.provider),
  )

  return { ...widths, main, isMainShown: layout.main.isOpen && main >= MAIN_MIN_WIDTH }
}

/** Открытая панель с новой шириной в целых пикселях; свёрнутая - как была. */
const fitted = <Panel extends PanelState<string>>(
  panel: Panel,
  width: number,
  isShown: boolean,
): Panel => (isShown ? { ...panel, width: Math.floor(width) } : panel)

/**
 * Панели, освободившие середине MAIN_MIN_WIDTH: человек попросил показать её (иконка,
 * выбор файла), а места нет. Ужимаются ровно на недостающее, от ширины на экране, и
 * новая ширина сохраняется. Целые пиксели вниз - чтобы середина точно не осталась
 * на долю пикселя короче предела.
 */
export const makeRoomForMain = (layout: Layout, room: number): Pick<Layout, PanelSide> => {
  const arrangement = arrangeLayout(layout, room)
  const shortage = MAIN_MIN_WIDTH - arrangement.main

  if (shortage <= 0) return { side: layout.side, provider: layout.provider }

  const onScreen: Panels = {
    side: { ...layout.side, width: arrangement.side },
    provider: { ...layout.provider, width: arrangement.provider },
    terminal: layout.terminal,
  }
  const widths = shrinkPanels(onScreen, shortage)

  return {
    side: fitted(layout.side, widths.side, isPanelShown(layout, 'side')),
    provider: fitted(layout.provider, widths.provider, isPanelShown(layout, 'provider')),
  }
}

/**
 * Панели после сдвига ручки одной из них на delta пикселей. Отсчёт - от ширины на
 * экране, а не сохранённой: ужатая узким окном панель отзывается на ручку сразу. Расти
 * можно в место середины, развёрнутой или нет, до самой полосы иконок - без щели между
 * ними. Дальше панель вытолкнула бы соседнюю за край окна.
 */
export const resizedPanels = (
  layout: Layout,
  room: number,
  side: PanelSide,
  delta: number,
): Pick<Layout, PanelSide> => {
  const arrangement = arrangeLayout(layout, room)
  const width = clampWidth(side, arrangement[side] + Math.min(delta, arrangement.main))

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

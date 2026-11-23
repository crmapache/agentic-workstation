import { app, Menu, BrowserWindow } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

import type { BarMenuEntry, WindowCommand } from '@shared/window'

import { IS_MAC } from './platform'
import { broadcast } from './ipc/broadcast'
import { barMenuItems } from './window/bar-menu'
import { isPanelFocused } from './agents/tabs/panel-focus'

type MenuActions = {
  openProject: () => void
}

/** Меню приложения после установки: его части, которые знает только окно. */
export type ApplicationMenu = {
  /** Кнопки полос окна (ADR 0112): меню View пересобирается с новыми галочками. */
  showBars: (bars: BarMenuEntry[]) => void
}

/**
 * ⌘W закрывает вкладку, как в WebStorm, а не окно: фокус в правой панели Claude Code -
 * вкладку разговора (решает панель: под вопросом и меню клавиша молчит), иначе - файл в
 * редакторе. Меню забирает нажатие раньше страницы, поэтому развилка здесь, а не в окне.
 * Окно закрывается кнопкой в шапке, IDE - ⌘Q.
 */
const closeTab = () => {
  if (isPanelFocused()) broadcast('claude:panelKey', 'closeTab')
  else broadcast('editor:command', 'closeTab')
}

/**
 * ⌘R перезагружает окно - но не из панели: там это рефлекс из других программ, а
 * перезагрузка посреди набора сбросила бы окно целиком.
 */
const reloadUnlessPanel = () => {
  if (!isPanelFocused()) BrowserWindow.getFocusedWindow()?.webContents.reload()
}

/** Команда окну целиком (window:command): настройки и размер текста - не дело одного вида. */
const toWindow = (command: WindowCommand) => () => broadcast('window:command', command)

/** Settings… (⌘, и Ctrl+,): настройки IDE открывает окно. */
const settingsItem: MenuItemConstructorOptions = {
  label: 'Settings…',
  accelerator: 'CmdOrCtrl+,',
  click: toWindow('openSettings'),
}

/** Меню программы - стандартное macOS, плюс Settings…. На Windows его нет: настройки - в File. */
const appMenu: MenuItemConstructorOptions = {
  label: app.name,
  submenu: [
    { role: 'about' },
    { type: 'separator' },
    settingsItem,
    { type: 'separator' },
    { role: 'services' },
    { type: 'separator' },
    { role: 'hide' },
    { role: 'hideOthers' },
    { role: 'unhide' },
    { type: 'separator' },
    { role: 'quit' },
  ],
}

/**
 * Размер текста вместо масштаба страницы (ADR 0024): ⌘+, ⌘- и ⌘0 двигают тот же размер,
 * что ползунок в настройках. Масштаб страницы растил бы и иконки с отступами, и у IDE
 * было бы два разных «крупнее». ⌘= - та же клавиша без Shift: «+» нарисован на ней, и
 * жмут её чаще всего без Shift.
 */
const textSizeItems: MenuItemConstructorOptions[] = [
  { label: 'Reset Text Size', accelerator: 'CmdOrCtrl+0', click: toWindow('textSizeReset') },
  { label: 'Increase Text Size', accelerator: 'CmdOrCtrl+Plus', click: toWindow('textSizeUp') },
  {
    label: 'Increase Text Size',
    accelerator: 'CmdOrCtrl+=',
    click: toWindow('textSizeUp'),
    visible: false,
    acceleratorWorksWhenHidden: true,
  },
  { label: 'Decrease Text Size', accelerator: 'CmdOrCtrl+-', click: toWindow('textSizeDown') },
]

/**
 * Кнопки полос окна в View: подменю каждой полосы с галочками (barMenuItems). Пока окно их не
 * прислало - ничего, иначе меню показало бы полосы без кнопок.
 */
const barItems = (bars: readonly BarMenuEntry[]): MenuItemConstructorOptions[] =>
  bars.length > 0
    ? [
        ...barMenuItems(bars, (command) => broadcast('window:barMenu', command)),
        { type: 'separator' },
      ]
    : []

/**
 * Меню приложения. Стандартные разделы macOS (правка, вид, окно) дают системные
 * сочетания: копирование, вставку, полноэкранный режим. Свои пункты - только то,
 * что относится ко всей IDE, а не к одному виду. Закрытие, перезагрузка и масштаб - свои, а
 * не роли: их клавиши значат другое (closeTab, reloadUnlessPanel, textSizeItems). На Windows
 * полосы меню не видно (шапку рисует страница), меню только держит сочетания клавиш: разделов
 * программы и окна macOS там нет, настройки и выход - в File; кнопки полос там возвращают
 * правой кнопкой на полосе. Electron не меняет готовое меню по частям, поэтому новые галочки
 * полос - это всё меню заново.
 */
export const installApplicationMenu = ({ openProject }: MenuActions): ApplicationMenu => {
  const build = (bars: readonly BarMenuEntry[]): MenuItemConstructorOptions[] => [
    ...(IS_MAC ? [appMenu] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: openProject },
        ...(IS_MAC ? [] : [settingsItem]),
        { type: 'separator' },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: closeTab },
        ...(IS_MAC ? [] : [{ type: 'separator' } as const, { role: 'quit' } as const]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: reloadUnlessPanel },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        ...textSizeItems,
        { type: 'separator' },
        ...barItems(bars),
        { role: 'togglefullscreen' },
      ],
    },
    ...(IS_MAC
      ? [
          {
            label: 'Window',
            role: 'window',
            submenu: [
              { role: 'minimize' },
              { role: 'zoom' },
              { type: 'separator' },
              { role: 'front' },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
  ]
  const install = (bars: readonly BarMenuEntry[]) =>
    Menu.setApplicationMenu(Menu.buildFromTemplate(build(bars)))

  install([])

  return { showBars: install }
}

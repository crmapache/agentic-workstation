import type { MenuItemConstructorOptions } from 'electron'

import type { BarMenuEntry, ActivityBarId, BarMenuCommand } from '@shared/window'

/** Подменю полос в View - по их месту в окне, как их называет человек. */
const BAR_TITLES: Record<ActivityBarId, string> = {
  side: 'Left Bar',
  main: 'Center Bar',
  provider: 'Right Bar',
}

/**
 * Подменю полос для меню View (ADR 0112): у каждой полосы её кнопки галочками - по группам и
 * в том порядке, в каком они стоят, - и «вернуть как было». Галочка шлёт окну, какой кнопка
 * стала (Electron переключает её до click), а не «переключить»: окно могло уйти вперёд меню.
 */
export const barMenuItems = (
  bars: readonly BarMenuEntry[],
  send: (command: BarMenuCommand) => void,
): MenuItemConstructorOptions[] =>
  bars.map(({ bar, groups }) => ({
    label: BAR_TITLES[bar],
    submenu: [
      ...groups.flatMap((group, index): MenuItemConstructorOptions[] => [
        ...(index > 0 ? [{ type: 'separator' } as const] : []),
        ...group.map((button): MenuItemConstructorOptions => ({
          label: button.label,
          type: 'checkbox',
          checked: button.shown,
          click: (item) => send({ kind: 'setShown', bar, id: button.id, shown: item.checked }),
        })),
      ]),
      { type: 'separator' },
      { label: 'Reset to Default', click: () => send({ kind: 'reset', bar }) },
    ],
  }))

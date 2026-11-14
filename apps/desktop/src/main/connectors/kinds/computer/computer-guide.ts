import { IS_WINDOWS } from '../../../platform'

/**
 * Пояснение сервера `computer` (ADR 0057, 0058) - как работать на компьютере человека настоящими
 * мышью и клавиатурой, и где граница с коннектором Browser: страницы сайтов - его, всё вокруг них -
 * здесь. На Windows - строка о том, что там иначе: cmd - это Ctrl, а приложения от имени
 * администратора ввод не принимают. Длина - в пределе 2048 знаков пояснения Claude Code вместе с
 * описанием человека (держит тест).
 */
export const computerGuide = (isWindows: boolean): string =>
  [
    "You work on the user's computer with the real mouse and keyboard, by screenshots: the user sees it and can't use the mouse meanwhile. Start with screenshot; every action returns a new one - check it. Coordinates are pixels of your latest screenshot; zoom to read small text.",
    'Web pages: use the Browser connector (server browser-chrome) when you have it - it works in the background. These tools are for Chrome itself (chrome:// pages, extensions menu, pinning tabs, dialogs, file pickers) and other apps; open_app brings an app to the front.',
    'If the user moves the mouse, your action stops: take a screenshot and go on. Pause and Stop are theirs. Leave private things on screen alone, and ask in the chat before anything that sends, buys or deletes.',
    isWindows
      ? 'This is Windows: in keys, cmd is Ctrl and win is the Windows key. Apps running as administrator ignore your input - leave those steps to the user.'
      : '',
  ]
    .filter(Boolean)
    .join('\n')

export const COMPUTER_GUIDE = computerGuide(IS_WINDOWS)

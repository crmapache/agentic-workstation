import { IS_WINDOWS } from '../../../platform'

/**
 * Пояснение сервера `computer` (ADR 0057, 0058) - как работать на компьютере человека настоящими
 * мышью и клавиатурой, и где граница с коннектором Browser: страницы сайтов - его, всё вокруг них -
 * здесь. На Windows - строка о том, что приложения от имени администратора ввод не принимают
 * (cmd - это Ctrl, говорят описания key и click). Сообщения людям (ADR 0095): абзацами, перевод
 * строки - Shift+Return, до Return - глазами по снимку. Клик по кнопке и пункту меню - с expect
 * (ADR 0119): инструмент не нажмёт, если под точкой другое. Длина - в пределе 2048 знаков пояснения
 * Claude Code вместе с описанием человека (держит тест), поэтому повторы описаний инструментов
 * отсюда убраны.
 */
export const computerGuide = (isWindows: boolean): string =>
  [
    "You work on the user's computer by screenshots; the user can't use the mouse meanwhile. Start with screenshot; each action returns a new one: check it. Coordinates are pixels of the latest one; zoom for small text.",
    'Click buttons, menu items, links and fields with expect (their label); check the answer is what you meant.',
    'Web pages: the Browser connector (server browser-chrome) if you have it, it works in the background. Here: Chrome itself (chrome:// pages, extensions menu, dialogs, file pickers) and other apps.',
    'If the user moves the mouse, your action stops: screenshot and go on. Pause and Stop are theirs. Leave private things alone; ask in chat before anything that sends, buys or deletes.',
    'Messages to people: write paragraphs (type makes line breaks Shift+Return); before Return, check text, breaks and chat on the screenshot.',
    isWindows ? 'Windows: apps run as admin ignore your input, leave those steps to the user.' : '',
  ]
    .filter(Boolean)
    .join('\n')

export const COMPUTER_GUIDE = computerGuide(IS_WINDOWS)

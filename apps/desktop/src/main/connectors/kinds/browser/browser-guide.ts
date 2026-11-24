/**
 * Как работать в Chrome человека - пояснение сервера browser-chrome для модели (ADR 0049).
 * Человек смотрит, как работает агент: курсор идёт и нажимает, текст печатается. Скрипт
 * (evaluate) делает то же мгновенно и невидимо, а на длинной форме модель сама выбрала бы его -
 * так быстрее. Поэтому это сказано до первого вызова, а не только в описании evaluate.
 *
 * Вкладки - правило владельца: сначала посмотреть, что у человека уже открыто (без этого модель
 * открывала свои там, где он ждал работы в своей), но работать в своей вкладке, даже если
 * такая страница уже открыта. Вкладку человека модель берёт, только когда он сказал об этом
 * прямо, косвенно или это ясно по делу (дозаполнить начатую им форму, продолжить начатое им).
 *
 * Сообщения людям (ADR 0095): без абзацев модель писала их одной строкой - боялась, что перевод
 * строки отправит сообщение. Теперь type переносит строку Shift+Enter и показывает поле
 * редактора текстом и картинкой; правило - глазами сверить поле и чат до Enter.
 *
 * Клик (ADR 0119): 24 ноября 2026 агент нажал «Aceptar» в Outlook по точке со снимка, а под ней
 * уже была «Rechazar». Инструмент теперь сверяет попадание сам, а правило здесь - чтобы кнопки,
 * которые что-то отправляют или отменяют, модель жала только по ref и сверяла ответ clicked.
 * Пояснение режет Claude Code на 2048 знаках вместе с описанием человека (держит тест), поэтому
 * слова сжаты.
 */
export const BROWSER_GUIDE = [
  "The user watches your pointer click and type in their Chrome like a fast person. Act on a page only with click, type, fill, select, press, hover and scroll; a whole form - one fill call. Use evaluate only to read or compute, never to click, type, tick, pick or submit: a script acts invisibly, the user can't follow it, and sites take it for a bot.",
  "Buttons that send, accept, decline, delete or pay: only by ref from a fresh snapshot; check the answer's clicked is what you meant.",
  'Tabs: first see what the user has open (tabs), then work in your own tab (open), even if the page is open in theirs. Take a tab of theirs (take) only when they ask, directly or indirectly, or the context makes it clear: they half-filled a form or started something there and ask you to go on.',
  "Messages to people: write paragraphs like a person; type makes line breaks Shift+Enter, so chats don't send early. Before Enter, check the field picture it returns and the chat.",
].join('\n')

/**
 * Граница с Computer Use (ADR 0057): страница - здесь, сам Chrome и окна системы - там. Только
 * когда в проекте есть Computer Use, и после слов человека: Claude Code режет пояснение сервера
 * до 2048 знаков, и описание коннектора не должно уходить под нож из-за этой заметки.
 */
export const BROWSER_COMPUTER_NOTE =
  "Chrome itself is out of these tools' reach: chrome:// pages, settings, the extensions menu, pinning tabs, permission and file dialogs. Do those with the computer tools of the Computer Use connector (server computer), then come back here for the page."

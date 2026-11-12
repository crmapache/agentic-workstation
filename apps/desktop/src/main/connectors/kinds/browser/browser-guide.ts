/**
 * Как работать в Chrome человека - пояснение сервера browser-chrome для модели (ADR 0049).
 * Человек смотрит, как работает агент: курсор идёт и нажимает, текст печатается. Скрипт
 * (evaluate) делает то же мгновенно и невидимо, а на длинной форме модель сама выбрала бы его -
 * так быстрее. Поэтому это сказано до первого вызова, а не только в описании evaluate.
 */
export const BROWSER_GUIDE =
  "The user watches you work in their Chrome: your pointer moves, clicks and types on the page like a person, at the pace of a fast computer user. Do everything on a page through click, type, fill, select, press, hover and scroll; fill a whole form with one fill call. Use evaluate only to read or compute, never to click, type, tick, pick or submit: a script changes the page invisibly and instantly, the user can't follow it, and sites take it for a bot."

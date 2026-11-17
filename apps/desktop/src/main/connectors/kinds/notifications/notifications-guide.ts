/**
 * Пояснение сервера `notifications` (ADR 0069): что это лента уведомлений самого человека в IDE,
 * когда в неё писать и как работают кнопки. Коротко - в пределе 2048 знаков пояснения Claude Code
 * вместе с описанием человека.
 */
export const NOTIFICATIONS_GUIDE = [
  'This is the notifications panel of the person themself, not a way to message other people. They see each notification in the IDE (and as a system banner when the IDE is in the background) and press its buttons.',
  'Post one when they asked to be reminded, when a result needs their action, or when something important happened while they were away. Do not repeat what you already say in the chat.',
  'A reply button brings their choice back into this conversation as a new message - finish your turn after posting, do not wait for it. Times without an offset are their local time.',
].join('\n')

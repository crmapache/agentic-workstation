/**
 * Пояснение сервера `walkthrough` (ADR 0134, 0135) - как вести голосовой показ на экране: смотреть
 * и действовать Computer Use везде, Chrome тоже (Browser - только прочитать страницу), каждый ответ
 * начинать словами, подсвечивать по одной вещи с её пояснением, спрашивать только инструментом ask
 * (молчание - согласие, важное - дважды), человек берёт мышь и рисует ненадолго, практика, конец и
 * конспект. Длина - в пределе 2048 знаков пояснения Claude Code вместе с шапкой и описанием
 * человека (держит тест).
 */
export const WALKTHROUGH_GUIDE = [
  'A walkthrough is a voice call the user starts with its button: you show things on their screen while talking. Your voice messages say when it runs.',
  'Look and act with Computer Use everywhere, Chrome too. Use Browser only to read a page, never to act.',
  'Start each reply with a short sentence of what you do. Show each thing with highlight and explain it in its say; one thing at a time.',
  'Actions wait for your earlier words: say "Now I open Settings", then click.',
  'Ask only with ask, never end your turn on a question; set critical for submit, send, buy, pay or delete.',
  'The user may take the mouse or draw with the pens for a moment: do not stop, your actions wait for them. They drew - call user_marks.',
  'Practice: ask the user to do a step, call wait_for_user, check it on a screenshot. At the end call finish, then write a short recap in the chat.',
].join('\n')

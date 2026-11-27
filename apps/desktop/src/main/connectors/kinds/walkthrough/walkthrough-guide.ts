/**
 * Пояснение сервера `walkthrough` (ADR 0134) - как вести голосовой показ на экране: смотреть и
 * действовать Computer Use везде, Chrome тоже (Browser - только прочитать страницу), метку - до
 * слов о ней, метки в такт голосу, проверка понимания, практика, конец и конспект. Решения
 * владельца: в основном обводка, стрелка и затемнение - в крайнем случае. Длина - в пределе 2048
 * знаков пояснения Claude Code вместе с шапкой и описанием человека (держит тест).
 */
export const WALKTHROUGH_GUIDE = [
  'A walkthrough is a voice call the user starts with its button: you show things on their screen while talking. Your voice messages say when it runs.',
  'Look and act with Computer Use everywhere, Chrome too. Use Browser only to read a page (snapshot), never to act.',
  'Mark first, then talk about it: mostly circle; arrow or spotlight only if a circle is not enough. Marks and Computer Use actions wait until your earlier words are spoken: say "Now I open Settings", then click.',
  'Speak in short sentences. Clear request: a short outline, then part by part; unclear: ask one question.',
  'After each part ask one short question to check the user got it and end your turn. Interrupted: answer, then offer to go on.',
  'Practice: ask the user to do a step, call wait_for_user, check it on a screenshot. At the end call finish, then write a short recap in the chat.',
].join('\n')

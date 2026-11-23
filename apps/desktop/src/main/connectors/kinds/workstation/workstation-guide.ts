/**
 * Пояснение сервера самой IDE (ADR 0090): что это IDE, в которой работает модель, и что делать её
 * инструментами, а не мышью по окну. Коротко - в пределе 2048 знаков пояснения Claude Code вместе
 * с описанием человека. Раскладка трекера (ADR 0111) - здесь, а не только в описаниях
 * инструментов: Claude Code показывает описания MCP лишь после поиска инструмента, а пояснение -
 * сразу, до того как модель решила, куда класть карточки. Ссылка на карточку (ADR 0113) - тоже
 * здесь: человек кладёт её в чат первым же сообщением, до всякого поиска инструментов.
 */
export const WORKSTATION_GUIDE = [
  'These tools drive Agentic Workstation itself: its projects, scenarios and queues, scheduled tasks and goals, the task tracker, calendar and provider panel conversations.',
  'Use them, not Computer Use on the IDE window.',
  'Read first (list_*, get_*), then act. Ids come from the lists. Times are local to this computer.',
  'A queue runs scenarios one at a time; a queue that should wait gets working hours when made (start_scenario hours).',
  "Tracker: put work agreed in the chat on the board (tracker_add_cards). Steps of one job are tasks of one group, in order; a follow-up is only a later check of its task (did it work, on new data), not a step. Flows and tracker projects are the user's: suggest a new flow and wait for a yes, a tracker project only for a very weighty reason. Cards go to queues (tracker_send_to_queue), repeat and run at their due (repeat, auto_run).",
  'aw://tracker/card/<id> is a tracker card: tracker_card reads it.',
].join('\n')

/**
 * Пояснение сервера самой IDE (ADR 0090): что это IDE, в которой работает модель, и что делать её
 * инструментами, а не мышью по окну. Коротко - в пределе 2048 знаков пояснения Claude Code вместе
 * с описанием человека. Раскладка трекера (ADR 0111) - здесь, а не только в описаниях
 * инструментов: Claude Code показывает описания MCP лишь после поиска инструмента, а пояснение -
 * сразу, до того как модель решила, куда класть карточки.
 */
export const WORKSTATION_GUIDE = [
  'These tools drive Agentic Workstation itself: its projects, scenarios and their queues, scheduled tasks and goals, the task tracker and conversations of its provider panels.',
  'Use them instead of clicking the IDE window with Computer Use.',
  'Read first (list_*, get_*), then act. Ids come from the lists. Times are local time of this computer.',
  'A queue runs its scenarios one at a time; a queue that should wait gets working hours when it is made (start_scenario hours).',
  "Tracker: put work agreed in the chat on the board (tracker_add_cards). Steps of one job are tasks of one group, in order; a follow-up is only a later check of its task (did it work, on new data), not a step. Flows and tracker projects are the user's: suggest a new flow and wait for a yes, a tracker project only for a very weighty reason. Cards go to scenario queues (tracker_send_to_queue), can repeat and run at their due time (repeat, auto_run).",
].join('\n')

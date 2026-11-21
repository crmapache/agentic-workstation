/**
 * Пояснение сервера самой IDE (ADR 0090): что это IDE, в которой работает модель, и что делать её
 * инструментами, а не мышью по окну. Коротко - в пределе 2048 знаков пояснения Claude Code вместе
 * с описанием человека.
 */
export const WORKSTATION_GUIDE = [
  'These tools drive Agentic Workstation itself, the IDE this conversation may run in: its projects, scenarios and their queues, scheduled tasks and goals, and the conversations of its provider panels.',
  'Use them instead of clicking through the IDE window with Computer Use: whatever the window does with scenarios, queues, tasks and conversations, these tools do directly.',
  'Read first (list_*, get_*), then act. Ids come from the lists. Times are local time of this computer.',
  'A queue runs its scenarios one at a time; a queue that should wait gets working hours when it is made (start_scenario hours).',
  'The task tracker (tracker_*) holds the cards of a project: put work agreed in the chat on its board (tracker_add_cards), and send cards with scenarios to a queue (tracker_send_to_queue). A card can repeat like in Todoist (repeat) and run its scenario at its due time by itself (auto_run).',
].join('\n')

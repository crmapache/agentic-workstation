/**
 * Сколько ждать итога хода после отметки CLI «команда хода кончилась». CLI пишет итог
 * раньше отметки, в тот же миг; пауза - запас, чтобы не закрыть ход раньше пришедшего
 * следом итога, если когда-нибудь порядок поменяется.
 */
export const COMMAND_RESULT_GRACE_MS = 1000

/**
 * Короче - имя по сообщению не просим: CLI на тексте короче 10 знаков отвечает пустым
 * («ок», «дальше» о разговоре ничего не говорят), и ждём следующего сообщения.
 */
export const TITLE_MIN_CHARS = 10

/**
 * Сколько начала сообщения уходит модели за именем. О чём разговор - в первых строках,
 * дальше вставленный лог или спецификация, а за них платили бы ради имени в пять слов.
 */
export const TITLE_SAMPLE_CHARS = 1000

/**
 * Команды, которые говорят, что сделали С разговором или с инструментом, а не о чём
 * работа: вкладка с именем «/compact» назвалась бы служебным шагом. Остальные команды -
 * работа (скилл, «/code-review») и называют разговор не хуже фразы. Сравнение - имени
 * целиком: «acme:status» плагина - его собственная команда.
 */
export const HOUSEKEEPING_COMMANDS: ReadonlySet<string> = new Set([
  'clear',
  'compact',
  'resume',
  'rewind',
  'fork',
  'export',
  'rename',
  'login',
  'logout',
  'exit',
  'quit',
  'upgrade',
  'model',
  'effort',
  'config',
  'permissions',
  'hooks',
  'agents',
  'todos',
  'memory',
  'mcp',
  'ide',
  'add-dir',
  'statusline',
  'output-style',
  'terminal-setup',
  'vim',
  'privacy-settings',
  'context',
  'cost',
  'usage',
  'status',
  'doctor',
  'help',
  'bug',
  'feedback',
  'release-notes',
])

/** Отказ на вопрос, который панель не умеет показать: без ответа ход повис бы навсегда. */
export const UNSUPPORTED_REQUEST = 'This host does not support this request.'

/** Сколько строк транскрипта разбирать подряд, прежде чем отдать управление. */
export const REPLAY_BATCH_LINES = 200

/**
 * Откат, на который CLI ответил «занят непрочитанным сообщением» (commands_queued):
 * ход останавливается и запрос повторяется - до трёх раз через полторы секунды. Замер
 * ACC на 2.1.280: остановленный ход сразу отдаёт это сообщение, следующая попытка режет
 * его вместе с остальным.
 */
export const REWIND_ATTEMPTS = 3
export const REWIND_RETRY_MS = 1500

/** Отказ вопросу, который висел, когда разговор откатили: отрезанное уже не важно. */
export const REWOUND_DENY = 'The user rewound the conversation to an earlier point.'

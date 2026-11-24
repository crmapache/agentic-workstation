/**
 * Вызовы, за которыми стоит задача-агент: субагент (Task, Agent) или флот (Workflow).
 * Их конец - уведомление задачи, а не обязательно результат вызова.
 */
export const AGENT_CALLS = new Set(['Task', 'Agent', 'Workflow'])

/** Вызов наблюдателя: каждая строка вывода его команды (или кадр сокета) будит агента. */
export const MONITOR_CALL = 'Monitor'

/**
 * Задачи CLI за процессом оболочки или сокетом, а не за агентом: фоновая команда Bash и
 * наблюдатель Monitor с командой - local_bash, наблюдатель с WebSocket - monitor_ws.
 */
export const SHELL_TASK_TYPES = new Set(['local_bash', 'monitor_ws'])

/**
 * Ответ CLI на запуск в фоне: это подтверждение запуска, а не отчёт. Workflow с CLI
 * 2.1.257 отвечает так же своими словами и дальше идёт фоновой задачей.
 */
export const BACKGROUND_LAUNCH =
  /^(Async agent launched successfully|Workflow launched in background)/

/** Имя задачи в подтверждении запуска workflow: «… Task ID: abc123». */
export const LAUNCHED_TASK_ID = /Task ID:\s*([\w-]+)/

/**
 * Сколько шагов из task_progress держать у агента: долгий субагент иначе рос бы без
 * предела, а старые шаги никто не читает (как в ACC - 300 строк).
 */
export const MAX_AGENT_STEPS = 300

/** Уведомление о задаче в транскрипте - его CLI пишет агенту от имени человека. */
export const NOTIFICATION_BLOCK = /<task-notification>[\s\S]*?(?:<\/task-notification>|$)/g

export const NOTIFIED_TOOL_USE = /<tool-use-id>([\s\S]*?)<\/tool-use-id>/
export const NOTIFIED_TASK = /<task-id>([\s\S]*?)<\/task-id>/
export const NOTIFIED_STATUS = /<status>([\s\S]*?)<\/status>/
export const NOTIFIED_SUMMARY = /<summary>([\s\S]*?)<\/summary>/

/**
 * Бюджеты разговора агента флота (как в ACC): задание агента ревью несёт весь список
 * файлов, ответ - десятки тысяч символов. Читается один агент по нажатию, но тело,
 * которое никто не долистает, не стоит дороги в окно.
 */
export const FLEET_PROMPT_CHARS = 8_000
export const FLEET_OUTPUT_CHARS = 60_000
export const FLEET_STEP_CHARS = 160
export const FLEET_MAX_STEPS = 200

/** Вызов, которым агент со схемой отвечает вместо слов: он и есть ответ. */
export const STRUCTURED_OUTPUT = 'StructuredOutput'

/** Чем назвать шаг: файл, команда, шаблон - в порядке, в котором вызов обычно узнают. */
export const STEP_TARGET_FIELDS = [
  'file_path',
  'command',
  'pattern',
  'path',
  'url',
  'description',
  'prompt',
]

/** Имя агента CLI: буквы, цифры, дефис и подчёркивание - разделителю пути там не место. */
export const AGENT_NAME = /^[\w-]{1,128}$/

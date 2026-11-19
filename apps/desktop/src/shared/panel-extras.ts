/**
 * Служебные возможности панели поверх разговора (как в ACC): вопрос сбоку (/btw), моды CLI,
 * быстрый режим, судьба выбора модели, продолжение оборванной работы, путь к CLI. Что из
 * этого есть у провайдера, говорят возможности панели (panel-capabilities.ts). Владелец -
 * главный процесс, окно зеркалит.
 */

/** Где вопрос сбоку: ждёт ответа, ответ пришёл, пришла заглушка CLI, отменён, не вышло. */
export type AsideState = 'asking' | 'answered' | 'empty' | 'cancelled' | 'failed'

/**
 * Почему вопрос кончился без ответа: процесс ушёл раньше (ended), десять минут тишины
 * (timeout), CLI отказал своими словами (refused).
 */
export type AsideFailure = 'ended' | 'timeout' | 'refused'

/** CLI повторяет запрос к API: его счётчики и когда пойдёт следующая попытка (мс). */
export type AsideRetry = { attempt: number; maxRetries: number; retryAt: number }

/** Один вопрос сбоку и чем он кончился. */
export type AsideExchange = {
  id: string
  question: string
  /** Когда спросили (мс): от него «Thinking aside · 12s». */
  askedAt: number
  state: AsideState
  /** Ответ модели (answered) или заглушка CLI, почему ответа нет (empty). */
  text: string
  /** Слова CLI о модели, которая отказалась, и той, что ответила вместо неё. */
  notice: string
  failure: AsideFailure | null
  /** Ошибка CLI словами CLI (refused): английский текст, как его написал CLI. */
  message: string
  retry: AsideRetry | null
}

/**
 * Цепочка вопросов сбоку одной вкладки. Агент её не видит, в транскрипт она не
 * пишется и перезапуск не переживает - как в терминале. open - карточка на экране:
 * закрыть - не забыть, голый /btw открывает её снова.
 */
export type AsideThread = { open: boolean; exchanges: AsideExchange[] }

/** Изменение цепочки вкладки - событием окну. */
export type AsideView = { conversationId: string; thread: AsideThread }

/** Окно мода, которое панель нарисовать не может, но называет. */
export type ModPane = { id: string; title: string; plugin: string }

/** Всплывашка мода: гаснет сама в until (мс). */
export type ModToast = { plugin: string; text: string; until: number }

/**
 * Что моды CLI (2.1.287+) держат на экране сейчас: строка статуса на мод, открытые окна
 * и последняя всплывашка. Живёт с процессом: он умер или заменён - пусто.
 */
export type ConversationMods = {
  status: Record<string, string>
  panes: ModPane[]
  toast: ModToast | null
}

/**
 * Что CLI сказал о быстром режиме в начале или в конце хода: on, off или пауза после
 * лимита (cooldown); reason - его слово, почему режим не работает.
 */
export type FastReport = { state: 'on' | 'off' | 'cooldown'; reason: string }

/**
 * Модель разговора не та, что выбрана (жёлтый акцент MODEL): CLI сам перешёл на другую
 * (swapped, from - откуда) или выбор человека не доехал (stuck, picked - что выбрали).
 */
export type ModelNote = { kind: 'swapped'; from: string } | { kind: 'stuck'; picked: string }

/**
 * Почему панель сама продолжает работу: смена аккаунта прервала ход, лимит отказал,
 * перезапуск процесса убил фоновых агентов.
 */
export type CarryOnReason = 'accountSwitch' | 'limit' | 'restart'

export const CARRY_ON_REASONS: readonly CarryOnReason[] = ['accountSwitch', 'limit', 'restart']

/**
 * План продолжить разговор после лимита: когда (мс) и угадан ли момент (лимит не сказал,
 * когда сбросится).
 */
export type CarryOnPlan = { until: number; guess: boolean }

/** Почему путь к CLI, названный руками, не принят: файла нет или это не Claude Code. */
export type CliPathRefusal = 'missing' | 'not-claude'

/**
 * Где панель искала CLI и какой путь назван руками: экран «Claude Code not found».
 * rejected - чем кончилась последняя попытка «Use this».
 */
export type CliSearch = { path: string; searched: string[]; rejected: CliPathRefusal | null }

/**
 * Умеет ли CLI держать два входа порознь (проба аккаунтов): умеет; переменную не
 * слушает (старый CLI); нет ни одного входа; вход по ключу API перебивает любой
 * аккаунт; ещё не спрашивали.
 */
export type AccountCapability = 'supported' | 'ignored' | 'not_signed_in' | 'api_key' | 'unknown'

/** Команды CLI, которые панель открывает в Терминале: интерактивные, потоковый CLI их не отдаёт. */
export type PanelTerminalCommand = 'design-login' | 'logout'

export const PANEL_TERMINAL_COMMANDS: readonly PanelTerminalCommand[] = ['design-login', 'logout']

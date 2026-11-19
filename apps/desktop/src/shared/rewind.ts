/**
 * Откат разговора к сообщению человека. conversation - сообщение и всё после него
 * уходят из ленты и из памяти агента; code - файлы, которые правили инструменты
 * агента, возвращаются к виду до сообщения; both - и то и другое.
 */
export type RewindScope = 'conversation' | 'code' | 'both'

/**
 * Что вернёт откат кода к сообщению (состояния ACC). ready - файлы, которые с тех пор
 * правили инструменты агента: пути от корня проекта или от «~», в списке не больше
 * REWIND_FILES_LISTED, count - сколько всего. none - ничего не правилось; off - копии
 * файлов выключены в настройках Claude Code; notTracked - процесс разговора поднят без
 * копий; noCheckpoint - копии не было, когда сообщение ушло; changedSince - файлы после
 * правок агента меняли, и вернуть их, не затерев те перемены, нельзя (Codex: копий нет, откат -
 * обратными правками); outsideProject - агент правил файлы вне проекта, туда откат не пишет;
 * unavailable - CLI не смог
 * ответить (detail - его слова; пусто - процесс не поднялся).
 */
export type RewindPreview =
  | { state: 'ready'; files: string[]; count: number; insertions: number; deletions: number }
  | { state: 'none' | 'off' | 'notTracked' | 'noCheckpoint' | 'changedSince' | 'outsideProject' }
  | { state: 'unavailable'; detail: string }

/** Сколько путей несёт предпросмотр: диалог всё равно называет горстку и число. */
export const REWIND_FILES_LISTED = 40

/**
 * Почему откат не прошёл (причины ACC). busy - идёт работа, которую отсюда не
 * остановить; gone - CLI этого сообщения уже не держит (его свернуло сжатие); moved -
 * после него пришло то, чего окно не видело; midCall - сообщение внутри вызова и его
 * ответа; notSaved - CLI не записал разрез; code - код не вернуть (detail - состояние
 * RewindPreview или слова CLI), ничего не тронуто; unsupported - этот CLI не умеет
 * откат; noProcess - процесс не поднялся; ended - процесс ушёл посреди отката, сделан
 * ли разрез - неизвестно; other - прочее (detail - слова CLI).
 */
export type RewindRefusal =
  | 'busy'
  | 'gone'
  | 'moved'
  | 'midCall'
  | 'notSaved'
  | 'code'
  | 'unsupported'
  | 'noProcess'
  | 'ended'
  | 'other'

/**
 * Итог отката. prefill - текст отрезанного сообщения, как его сохранил CLI (запасной,
 * если в ленте сообщения нет). filesFailed - разговор откатился, а код нет: слова CLI;
 * null - код не просили или он вернулся.
 */
export type RewindOutcome =
  | { rewound: true; prefill: string; filesFailed: string | null }
  | { rewound: false; reason: RewindRefusal; detail: string }

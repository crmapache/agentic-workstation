/**
 * Проект на проводе - ключ, а не путь: `p-` открытый вкладкой, `r-` недавний, дальше 22 знака
 * base64url от SHA-256 пути. Хеш считает IDE; телефон ключ только хранит и возвращает. Ключ
 * недавнего после открытия проекта перестаёт что-либо значить - телефон получит новый список.
 */

export const OPEN_PROJECT_PREFIX = 'p-'

export const RECENT_PROJECT_PREFIX = 'r-'

/** Доска всех очередей сценариев в подписке. */
export const ALL_PROJECTS = '*'

export const isOpenProjectKey = (key: string): boolean => key.startsWith(OPEN_PROJECT_PREFIX)

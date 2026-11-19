/** Адрес сайта в тексте справки: только https, до пробела. */
export const HELP_URL = /https:\/\/\S+/g

/** Знаки в конце адреса - конец фразы, а не адреса: «…terms?hl=en.» */
export const URL_TAIL = /[.,;:!?)\]'"]+$/

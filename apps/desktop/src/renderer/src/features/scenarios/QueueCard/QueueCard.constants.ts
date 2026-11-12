/**
 * Потолок имени очереди - как у главного процесса (`scenarios:queue` режет rename до 200):
 * поле не даёт набрать то, что всё равно обрежут.
 */
export const QUEUE_NAME_MAX = 200

/** Иконка-метка «очередь встанет после этого» - ростом с мелкий текст строки. */
export const MARK_ICON_SIZE = 12

/** Провайдеры очереди перечнем («Claude Code, Codex»): элементы очереди могут идти у разных. */
export const PROVIDER_LIST = new Intl.ListFormat('en', { style: 'narrow', type: 'unit' })

/** Вкладка вида уведомлений: входящие, запланированные напоминания, закрытые. */
export type InboxTab = 'open' | 'scheduled' | 'done'

/** Отказ главного процесса на нажатие - код причины, текст у i18n. */
export type InboxNotice = { code: string }

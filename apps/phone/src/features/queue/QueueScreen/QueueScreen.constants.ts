/** Имена очередей через запятую и «and»: «Deploy and Fix». */
export const QUEUE_NAMES = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })

/** Срок пробуждения очереди («14:30», «Nov 3, 10:00») сверяется с часами раз в минуту. */
export const REST_TICK_MS = 60_000

/** Имена очередей через запятую и «and»: «Deploy and Fix», «Deploy, Fix and Docs». */
export const QUEUE_NAMES = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })

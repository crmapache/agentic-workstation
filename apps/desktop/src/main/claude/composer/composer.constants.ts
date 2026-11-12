import { DAY_MS } from '@shared/time-units'

/** Папка в userData, куда пишутся вставленные из буфера скриншоты и документы. */
export const PASTED_DIR_NAME = 'pasted'

/** Сколько живёт вставленный файл: старше - удаляется при следующей вставке. */
export const PASTED_MAX_AGE_MS = 14 * DAY_MS

/** Потолок вставленного файла: больше в сообщение всё равно не нужно. */
export const PASTED_MAX_BYTES = 50 * 1024 * 1024

/** Имя файла из буфера - буквы, цифры и простая пунктуация, не длиннее этого. */
export const PASTED_NAME_MAX = 120

/** Расширения картинок: такой файл - чип картинки, а не файла. */
export const PICTURE_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
])

/** Сколько путей за раз можно перетащить или выбрать в поле. */
export const MAX_ATTACH_PATHS = 100

/** Глубина подпапок команд («/a:b:c») и потолок кандидатов - от закольцованных ссылок. */
export const COMMANDS_MAX_DEPTH = 4
export const COMMANDS_MAX_FILES = 4_000

/** Описание команды в подсказке: больше строки всё равно не видно. */
export const COMMAND_HINT_MAX = 200

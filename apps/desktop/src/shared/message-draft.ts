/**
 * Черновик сообщения в поле ввода панели провайдера: текст и вложения вперемешку, в том
 * порядке, в каком их положили (ADR 0009, поведение - как в ACC). Окно собирает из него
 * текст для CLI, главный процесс хранит его в очереди и кладёт в ленту, чтобы сообщение
 * рисовалось чипами, а не путями.
 */

/**
 * Вид вложения: файл, картинка, папка, команда, кусок файла из редактора, цитата из
 * ответа и свёрнутая длинная вставка.
 */
export type ChipKind = 'file' | 'img' | 'dir' | 'cmd' | 'ref' | 'quote' | 'paste'

export const CHIP_KINDS: readonly ChipKind[] = [
  'file',
  'img',
  'dir',
  'cmd',
  'ref',
  'quote',
  'paste',
]

export type DraftChip = {
  kind: ChipKind
  /**
   * Что за вложением: путь (от корня проекта или абсолютный), «Image #3» у вставленной
   * картинки, имя команды без «/», «ref1» у цитаты, «pasted» у вставки.
   */
  value: string
  /** Строки у куска файла из редактора: «L12-L18». */
  range?: string | undefined
  /** Вставленная картинка: data URL с байтами - они и едут модели вложением. */
  data?: string | undefined
  /** Куда байты вставленной картинки записаны на диск: путь для копии и после перезапуска. */
  path?: string | undefined
  /** Полный текст цитаты или свёрнутой вставки: он и уходит модели. */
  text?: string | undefined
}

export type DraftToken = { kind: 'text'; value: string } | { kind: 'chip'; chip: DraftChip }

/** Цитата из ответа над полем: уходит строкой «> текст» в начале сообщения. */
export type DraftQuote = { id: string; text: string }

/**
 * Сообщение кусками - для отрисовки там, где оно уже ушло: строка очереди, карточка в
 * ленте. Без байтов картинок: их держит главный процесс, окну хватает подписи.
 */
export type MessageDraft = { tokens: DraftToken[]; quotes: string[] }

/**
 * Что было открыто в редакторе, когда сообщение ушло: путь от корня проекта, имя файла и
 * выделенные строки, если они были. Модель получает это отдельной заметкой, под
 * сообщением в ленте - строка «14 lines from Foo.ts».
 */
/**
 * Больше выделение модели не везётся: заметка называет только строки, и модель читает
 * их сама. Окно по этому же пределу не тащит длинное выделение в сообщение вовсе.
 */
export const MAX_SELECTION_CHARS = 20_000

export type EditorRef = {
  path: string
  name: string
  from?: number | undefined
  to?: number | undefined
  /** Выделенный текст; длинное выделение не едет - модели называются только строки. */
  text?: string | undefined
}

/**
 * Вложение, которое человек выбрал в системном диалоге или перетащил: путь (от корня
 * проекта, если внутри него, иначе абсолютный) и вид - по нему окно выбирает чип.
 */
export type AttachmentPath = { path: string; kind: 'file' | 'img' | 'dir' }

/** Команда или скилл с диска для подсказки «/»: описание и синтаксис - из frontmatter. */
export type CommandHint = { name: string; description: string; argumentHint: string }

/** Сообщение, вынутое из очереди в поле: куски с байтами картинок и сосед, перед которым оно стояло. */
export type TakenQueued = { text: string; draft: MessageDraft | null; before: string | null }

/**
 * Где картинка чипа, когда её байтов в окне нет (как в ACC): файл (выбранная картинка или
 * записанная вставка - от корня проекта, от «~» или целиком), сообщение очереди или
 * отправленное сообщение. image - её место среди вставленных картинок сообщения.
 */
export type PicturePlace =
  | { kind: 'file'; path: string }
  | { kind: 'queued'; conversationId: string; queuedId: string; image: number }
  | { kind: 'said'; conversationId: string; messageId: string; image: number }

/**
 * Картинка для показа: data URL и размер самой картинки - превью бывает уменьшенной
 * копией большой. Размер 0 - неизвестен (SVG, формат, который IDE не разжимает).
 */
export type PictureView = { data: string; width: number; height: number }

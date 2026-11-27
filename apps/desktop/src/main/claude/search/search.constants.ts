/** Насыщение BM25 по частоте слова и вес длины сообщения. */
export const BM25_K1 = 1.2
export const BM25_B = 0.6

/**
 * Насколько совпадение - совпадение: слово как набрано, его начало, опечатка, основа.
 * Основа - самый слабый путь: точное слово её перевешивает.
 */
export const WEIGHT_EXACT = 1
export const WEIGHT_PREFIX = 0.75
export const WEIGHT_FUZZY = 0.5
export const WEIGHT_STEM = 0.4

/** С шести букв у слова есть окончание: основа - минус до трёх с конца, но не короче пяти. */
export const STEM_MIN = 6
export const STEM_KEEP = 5
export const STEM_CUT = 3

/** Однобуквенное начало - половина словаря: начало должно говорить больше. */
export const PREFIX_MIN = 2

/** Сколько слов может стоять за одним началом: дальше слово ещё ничего не значит. */
export const PREFIX_LIMIT = 400

/** Короче четырёх букв правка делает другое слово, а не опечатку; две правки - с семи. */
export const FUZZY_MIN = 4
export const FUZZY_TWO_MIN = 7

/**
 * Мёртвые сообщения (разговор перечитан, откат, файл исчез) копятся в индексе отметкой;
 * когда их больше живых, индекс перестраивается.
 */
export const COMPACT_MIN_DEAD = 500

/** Сколько текста вокруг первого совпадения показывает строка списка и сколько из него - до слова. */
export const SNIPPET_WINDOW = 220
export const SNIPPET_LEAD = 70
export const ELLIPSIS = '…'

/** Сколько сообщения держит индекс: сотый килобайт вставленного лога никто искать не будет. */
export const MAX_TEXT_CHARS = 20_000

/** Сколько верить обновлению: поиск по мере набора спрашивает много раз в секунду. */
export const REFRESH_INTERVAL_MS = 1_500

/** Сколько последних сообщений модели помнить для номера блока - их строки идут подряд. */
export const BLOCK_MEMORY = 8

/** Первая сборка - через столько после открытия проекта, в фоне, а не первым нажатием. */
export const WARM_UP_DELAY_MS = 20_000

/** Сколько находок в списке: дальше пятидесяти никто не читает. */
export const HIT_LIMIT = 50

/** Сколько текста сообщения едет с находкой - прочитать его в списке, не открывая. */
export const HIT_TEXT_CHARS = 3_000

/** Папка индексов в userData: по папке на проект. */
export const SEARCH_DIR_NAME = 'claude-search'

/**
 * Форма копии на диске; смена - перестройка копий всех проектов из транскриптов.
 * 1 - сообщения с местом в ленте (anchor) и номера блоков в манифесте.
 */
export const COPY_FORMAT = 1
export const MANIFEST_FILE = 'manifest.json'
export const CORPUS_DIR = 'corpus'
export const SESSIONS_FILE = 'sessions.txt'

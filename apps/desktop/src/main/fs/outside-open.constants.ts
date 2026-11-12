/**
 * Расширения, которые система не открывает, а запускает или устанавливает: приложения
 * и их части, скрипты, установщики, образы дисков, сценарии Automator и AppleScript,
 * ярлыки на другие файлы и адреса, профили настроек. Путь в ленту пишет агент (а в
 * его текст попадает что угодно из сети), поэтому клик по такому файлу только
 * показывает его в Finder - запустить его человек решит сам.
 */
export const RUNNABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  // Приложения, их расширения и установщики macOS.
  '.app',
  '.appex',
  '.action',
  '.bundle',
  '.dmg',
  '.kext',
  '.mobileconfig',
  '.mpkg',
  '.osax',
  '.pkg',
  '.plugin',
  '.prefpane',
  '.qlgenerator',
  '.saver',
  '.service',
  '.workflow',
  // Скрипты: Терминал, Script Editor, Python Launcher их выполняют.
  '.applescript',
  '.bash',
  '.command',
  '.csh',
  '.fish',
  '.jar',
  '.ksh',
  '.pl',
  '.py',
  '.pyw',
  '.rb',
  '.scpt',
  '.scptd',
  '.sh',
  '.terminal',
  '.tool',
  '.zsh',
  // Ярлыки: ведут на другой файл или адрес, который тоже может оказаться программой.
  '.fileloc',
  '.inetloc',
  '.lnk',
  '.url',
  '.webloc',
  // Windows: в macOS не запустятся, но и открывать их незачем.
  '.bat',
  '.cmd',
  '.com',
  '.exe',
  '.msi',
  '.ps1',
  '.vbs',
])

/**
 * Что на Windows можно отдать системе «открыть» (ADR 0048) - только документы и медиа: там
 * запускают по двойному щелчку слишком многое (скрипты Windows Script Host, справка .chm,
 * образы дисков, надстройки Office, ярлыки поиска), и чёрный список полным не бывает. Бита
 * исполнения у файлов Windows нет, так что остальное только показывается в Проводнике. HTML и
 * SVG сюда не входят: браузер исполнил бы их скрипты.
 */
export const WINDOWS_OPENABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.log',
  '.csv',
  '.tsv',
  '.json',
  '.jsonl',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
  '.heic',
  '.mp3',
  '.wav',
  '.m4a',
  '.flac',
  '.ogg',
  '.mp4',
  '.mov',
  '.mkv',
  '.webm',
  '.docx',
  '.xlsx',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
  '.rtf',
])

/** Бит исполнения у владельца, группы или всех: такой файл - программа, как бы он ни назывался. */
export const EXECUTABLE_MODE_BITS = 0o111

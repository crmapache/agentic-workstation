export type DirectoryEntryKind = 'directory' | 'file'

/** Строка дерева файлов: один элемент каталога проекта. */
export type DirectoryEntry = {
  name: string
  /** Путь от корня проекта, через «/». У корня - пустая строка. */
  relativePath: string
  kind: DirectoryEntryKind
  /** Элемент - символическая ссылка. kind при этом описывает то, куда она ведёт. */
  isSymlink: boolean
}

/**
 * Куда ведёт путь, написанный в тексте (лента Claude Code), - ответ главного процесса,
 * который спросил диск. Файл и папка проекта - от корня через «/» в NFC, как в дереве;
 * вне проекта - абсолютный путь. choose - голое имя нашлось в нескольких местах проекта
 * (пути от корня, ближние к корню первыми). missing - ничего нет или путь отвергнут
 * (сетевой): ссылка в никуда должна сказать об этом, а не промолчать.
 */
export type PathLocation =
  | { kind: 'projectFile'; relativePath: string }
  | { kind: 'projectFolder'; relativePath: string }
  /**
   * opensInTab - откроет ли его вкладка IDE: текст - редактором, картинка - картинкой; нет -
   * PDF, архив, большая картинка: их честнее отдать своей программе.
   */
  | { kind: 'outsideFile'; absolutePath: string; opensInTab: boolean }
  | { kind: 'outsideFolder'; absolutePath: string }
  | { kind: 'choose'; candidates: string[] }
  | { kind: 'missing' }

/**
 * Что поменялось на диске проекта за пачку событий слежения. directories - папки, чьё
 * содержимое перечитать (от корня, корень - пустая строка); renamed - пути, которые
 * появились, пропали или переименовались: если это папки, всё под ними читалось по
 * старому месту и тоже перечитывается. files - все пути, где что-то случилось, и правка
 * содержимого тоже: по ним редактор перечитывает открытые файлы (у файла вне проекта,
 * открытого вкладкой, - абсолютный путь, его ключ вкладки). directories и files
 * null - событий так много, что перечитать проще всё. git - поменялось что-то в .git:
 * ветка, индекс, коммиты.
 */
export type ProjectDiskChange = {
  projectId: string
  directories: string[] | null
  renamed: string[]
  files: string[] | null
  git: boolean
}

/**
 * Версия файла на диске: номер файла (inode), время изменения и время смены метаданных
 * в наносекундах, размер - одной строкой. Редактор помнит версию, от которой правит, и
 * сравнивает целиком: другая - файл менял кто-то ещё. Время смены метаданных вручную не
 * выставить, а номер файла меняет запись через переименование.
 */
export type FileVersion = string

/**
 * Отпечаток текста файла (SHA-256 от UTF-8 без BOM). Окно помнит отпечаток текста, от
 * которого правит: файл тронули, а текст тот же (touch, git stash и pop, lint-staged) -
 * это не чужая правка, и вопроса не нужно.
 */
export type TextHash = string

/** Почему файл не прочитался или не записался: нет прав, путь ведёт за проект, другое. */
export type FileFailure = 'denied' | 'outside' | 'unknown'

/**
 * Файл для редактора. text - UTF-8 без метки BOM (bom - была ли она, при записи
 * вернётся); readOnly - писать в файл нельзя; outside - файл за пределами проекта (ссылка
 * туда или файл вне проекта, открытый ссылкой): такой файл пишется только по явной просьбе
 * (⌘S), не сам. realPath -
 * путь от корня до настоящего файла, если файл открыт по ссылке внутри проекта: слежение
 * за диском называет настоящий путь. unchanged - на диске та версия, что окно уже знает,
 * текст не пересылается. binary - не текст или не UTF-8: показать нечего, а записать
 * обратно - испортить. tooLarge - больше предела (limit, в байтах), который редактор
 * открывает. missing - файла нет (или это папка). failed - файл есть, но не читается.
 */
export type FileRead =
  | {
      kind: 'text'
      text: string
      version: FileVersion
      bom: boolean
      readOnly: boolean
      outside: boolean
      realPath: string | null
      hash: TextHash
    }
  | { kind: 'unchanged' }
  | { kind: 'binary' }
  | { kind: 'tooLarge'; size: number; limit: number }
  | { kind: 'missing' }
  | { kind: 'failed'; reason: FileFailure }

/**
 * Чем кончилась запись. saved - на диске то, что прислали, с этой версией. conflict - на
 * диске уже не та версия, от которой правили, и не тот же текст: файл поменял кто-то ещё
 * (Claude Code, терминал), и молча затереть его нельзя. missing - файла больше нет.
 * failed - нет прав, путь ведёт за проект без явной просьбы, другое.
 */
export type FileWrite =
  | { kind: 'saved'; version: FileVersion; hash: TextHash }
  | { kind: 'conflict' }
  | { kind: 'missing' }
  | { kind: 'failed'; reason: FileFailure }

/**
 * Команда редактору, которую поймал главный процесс: ⌘W вне панели Claude Code (меню
 * забирает нажатие раньше страницы) и «сохрани всё» перед выходом из IDE.
 */
export type EditorCommand = 'closeTab' | 'saveAll'

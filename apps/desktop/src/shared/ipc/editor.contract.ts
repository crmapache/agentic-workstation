import type { DefinitionAnswer } from '../definitions'
import type { FileRead, TextHash, FileWrite, FileVersion, EditorCommand } from '../fs'
import type { WebImageRead, ProjectImageRead } from '../preview-images'

/** Файл проекта: путь от корня через «/». */
type ProjectFileRequest = { projectId: string; relativePath: string }

/**
 * Файл редактора: файл проекта (relativePath) или файл вне проекта по абсолютному пути
 * (absolutePath) - его открыли ссылкой. Ровно одно из двух: путь от корня никогда не
 * становится абсолютным молча. projectId - у обоих: вкладка живёт в проекте, а закрытый
 * проект ничего не читает.
 */
type FileRequest = { projectId: string } & (
  | { relativePath: string; absolutePath?: undefined }
  | { absolutePath: string; relativePath?: undefined }
)

/**
 * Часть контракта (contract.ts) про редактор середины окна: чтение и запись файлов
 * проекта и команды, которые за редактор ловит меню приложения. Отдельным файлом по
 * области, правила те же (.claude/rules/ipc-contract.md).
 */
export type EditorInvokeContract = {
  /** known - версия, которую окно уже держит: та же на диске - ответ unchanged, без текста. */
  'fs:readFile': { request: FileRequest & { known?: FileVersion | null }; response: FileRead }
  /**
   * Записать текст файла. expected - версия, от которой правили: на диске другая и
   * другой текст - конфликт, файл не трогается. null - записать поверх (человек выбрал
   * «оставить моё»). base - отпечаток текста, от которого правили: версия другая, а текст
   * на диске тот же - файл только тронули, запись идёт. bom - вернуть метку UTF-8, с
   * которой файл был прочитан. outside - человек сам попросил записать файл, ссылка
   * которого ведёт за проект, или файл вне проекта (⌘S): без него такой файл не пишется.
   */
  'fs:writeFile': {
    request: FileRequest & {
      text: string
      bom: boolean
      expected: FileVersion | null
      base?: TextHash | null
      outside?: boolean
    }
    response: FileWrite
  }
  /**
   * Где определено имя в коде (⌘ + наведение, ⌘B, ADR 0061): переменная, параметр, функция,
   * тип - в том же файле; импорт - в файле модуля, у самого экспорта; путь импорта - сам файл.
   * offset - смещение в тексте модели, version - её версия. Текст едет, только когда главный
   * процесс этой версии ещё не видел: тогда ответ needText, и окно спрашивает снова с текстом.
   */
  'editor:definition': {
    request: FileRequest & { offset: number; version: string; text?: string }
    response: DefinitionAnswer
  }
  /**
   * Картинка проекта для просмотра Markdown. Путь - из текста файла, то есть чужой:
   * читается только картинка, только внутри проекта и не больше потолка. known - версия,
   * которую окно уже держит: та же - unchanged, без байтов.
   */
  'fs:readImage': {
    request: ProjectFileRequest & { known?: FileVersion | null }
    response: ProjectImageRead
  }
  /**
   * Картинка с сайта для просмотра Markdown - только после нажатия человека «показать»:
   * окно в сеть не ходит, грузит главный процесс в своём сеансе, только https.
   */
  'preview:readWebImage': { request: { url: string }; response: WebImageRead }
  /**
   * Ответ на editor:command saveAll: всё, что можно, записано. unsaved - сколько файлов
   * с вопросом (конфликт, удалён, не записался) так и осталось несохранённым: тогда выход
   * отменяется, а окно спрашивает человека.
   */
  'editor:savedAll': { request: { unsaved: number }; response: void }
  /**
   * Человек согласился потерять несохранённое: следующий выход не спрашивает. quit -
   * выйти сразу (вопрос задал выход); без него - выход следом начнёт обновление.
   */
  'editor:allowQuit': { request: { quit: boolean }; response: void }
}

export type EditorEventContract = {
  'editor:command': EditorCommand
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const EDITOR_CHANNELS = {
  'fs:readFile': true,
  'fs:writeFile': true,
  'editor:definition': true,
  'fs:readImage': true,
  'preview:readWebImage': true,
  'editor:savedAll': true,
  'editor:allowQuit': true,
} satisfies Record<keyof EditorInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const EDITOR_EVENTS = {
  'editor:command': true,
} satisfies Record<keyof EditorEventContract, true>

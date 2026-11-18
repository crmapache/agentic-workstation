import type { CommandHint, PictureView, PicturePlace, AttachmentPath } from '../claude-draft'

type ProjectRequest = { projectId: string }

/**
 * Часть контракта (contract.ts) про поле ввода Claude Code: правка очереди из поля,
 * команды с диска и вложения. Отдельным файлом по области: общий
 * контракт перерос лимит строк. В InvokeContract и INVOKE_CHANNELS входит целиком,
 * правила те же (.claude/rules/ipc-contract.md).
 */
export type ClaudeComposerInvokeContract = {
  /** Команды и скиллы с диска (проект, свои, плагины) - для «/» ещё до первого хода. */
  'claude:listCommands': { request: ProjectRequest; response: CommandHint[] }
  /** Системный выбор файлов, картинок и папок для поля. Отмена - пустой список. */
  'claude:pickAttachments': { request: ProjectRequest; response: AttachmentPath[] }
  /** Что за пути перетащили в поле: файл, картинка или папка; внутри проекта - от корня. */
  'claude:describePaths': {
    request: ProjectRequest & { paths: string[] }
    response: AttachmentPath[]
  }
  /**
   * Записать вставленное из буфера (скриншот, документ) в каталог IDE: у байтов из буфера
   * пути нет. Ответ - путь файла; не вышло - null.
   */
  'claude:savePasted': { request: { name: string; data: string }; response: string | null }
  /**
   * Картинка за чипом - превью под курсором (whole false: большая уменьшена) или целиком
   * для просмотра. null - показать нечего: файла нет, сообщение ушло, формат не тот.
   */
  'claude:readPicture': {
    request: ProjectRequest & { place: PicturePlace; whole: boolean }
    response: PictureView | null
  }
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const CLAUDE_COMPOSER_CHANNELS = {
  'claude:listCommands': true,
  'claude:pickAttachments': true,
  'claude:describePaths': true,
  'claude:savePasted': true,
  'claude:readPicture': true,
} satisfies Record<keyof ClaudeComposerInvokeContract, true>

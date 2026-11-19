import { sep } from 'node:path'

/**
 * Папки, которым человек доверился в панели провайдера без своего списка доверия (Codex,
 * OpenCode): CLI читает в них инструкции, навыки и настройки проекта, а хуки и команды
 * проекта выполняются. Вложенная папка доверенной - тоже доверена.
 */
export class FolderTrust {
  private readonly folders: Set<string>

  constructor(
    stored: readonly string[],
    private readonly onChange: () => void,
  ) {
    this.folders = new Set(stored)
  }

  get list(): string[] {
    return [...this.folders]
  }

  isTrusted(projectPath: string): Promise<boolean> {
    return Promise.resolve(
      [...this.folders].some(
        (folder) => projectPath === folder || projectPath.startsWith(folder + sep),
      ),
    )
  }

  trust(projectPath: string): void {
    this.folders.add(projectPath)
    this.onChange()
  }
}

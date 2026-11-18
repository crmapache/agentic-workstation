import type { SlashCommand } from '@shared/claude'

/**
 * Команды, которые CLI назвал последними, - по папке проекта. Список живёт только в
 * процессе CLI (подсказки MCP-серверов, скиллы плагинов и claude.ai на диске проекта не
 * найти), а процесс поднимается лишь на первое сообщение - поэтому, как в ACC, имена
 * переживают перезапуск IDE на диске, и подсказка «/» знает их до первого хода. Пояснения
 * на диск не идут: их потом даст сам CLI, а держать десятки килобайт текста в файле,
 * который пишется на каждый ход, незачем.
 */
export class ProjectCommands {
  private readonly byProject: Record<string, SlashCommand[]>

  /** onChange(saved) - поменялись имена (записать на диск) или только пояснения. */
  constructor(
    stored: Record<string, string[]>,
    private readonly onChange: (saved: boolean) => void,
  ) {
    this.byProject = Object.fromEntries(
      Object.entries(stored).map(([path, names]) => [
        path,
        names.map((name) => ({ name, description: '', argumentHint: '' })),
      ]),
    )
  }

  get view(): Record<string, SlashCommand[]> {
    return this.byProject
  }

  of(projectPath: string): SlashCommand[] {
    return this.byProject[projectPath] ?? []
  }

  set(projectPath: string, commands: SlashCommand[]): void {
    const before = this.of(projectPath).map((command) => command.name)
    const renamed = before.join('\n') !== commands.map((command) => command.name).join('\n')

    this.byProject[projectPath] = commands
    this.onChange(renamed)
  }

  /** Для диска - только имена. */
  stored(): Record<string, string[]> {
    return Object.fromEntries(
      Object.entries(this.byProject).map(([path, commands]) => [
        path,
        commands.map((command) => command.name),
      ]),
    )
  }
}

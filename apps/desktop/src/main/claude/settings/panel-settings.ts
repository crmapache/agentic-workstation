import type { ProjectClaudeSettings } from '@shared/claude-config'
import type { PermissionMode } from '@shared/conversation'
import type { PanelPrefs } from '@shared/panel-prefs'
import { DEFAULT_PANEL_PREFS } from '@shared/panel-prefs'

import { ClaudeConfigDesk } from '../config/config-desk'
import { claudeHome } from '../history/transcript-paths'
import type { ToolsHost } from '../tools/tools-host'
import { isBypassDisabled, allowedPinnedMode, defaultPermissionMode } from './default-mode'
import { applyPrefsPatch } from './panel-prefs'

/**
 * Настройки панели (экран Settings) и то, что за ними стоит в главном процессе: режим
 * новой вкладки по слоям настроек Claude Code, ответ экранам о файлах настроек проекта и
 * собственные настройки Claude Code (`/config`). Владелец значений - здесь, пишет их на
 * диск и рассылает окну сервис разговоров (onChange).
 */
export class PanelSettings {
  prefs: PanelPrefs = DEFAULT_PANEL_PREFS
  /** Экран Claude Code settings: список `/config` от CLI и правки через него. */
  readonly config: ClaudeConfigDesk

  constructor(
    host: ToolsHost,
    private readonly onChange: () => void,
  ) {
    this.config = new ClaudeConfigDesk(host)
  }

  /** Патч из окна; негодное поле - отказ целиком. */
  apply(patch: unknown): void {
    this.prefs = applyPrefsPatch(this.prefs, patch)
    this.onChange()
  }

  /** Режим, закреплённый для новых вкладок, - если проект его допускает; иначе null. */
  async pinnedMode(projectPath: string): Promise<PermissionMode | null> {
    const mode = this.prefs.newTabMode

    if (mode !== 'bypassPermissions') return mode

    const home = await claudeHome()

    return allowedPinnedMode(mode, await isBypassDisabled(projectPath, home))
  }

  /** Режим новой вкладки по настройкам CLI. */
  async defaultMode(projectPath: string): Promise<PermissionMode> {
    return defaultPermissionMode(projectPath, await claudeHome())
  }

  /** Что файлы настроек проекта значат для экранов: запрещён ли режим без вопросов. */
  async projectInfo(projectPath: string): Promise<ProjectClaudeSettings> {
    return { bypassDisabled: await isBypassDisabled(projectPath, await claudeHome()) }
  }
}

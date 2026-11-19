import type { ModelInfo, EffortLevel, Conversation, PermissionMode } from '@shared/conversation'

/** Песочница Codex по-короткому (`thread/start`, `thread/resume`). */
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

/** Как Codex спрашивает разрешения и где он может писать - для режима панели. */
export type CodexPolicy = {
  approvalPolicy: 'untrusted' | 'on-request' | 'never'
  sandbox: SandboxMode
  /** Та же песочница объектом - так её берёт `turn/start`. */
  sandboxPolicy: Record<string, unknown>
  /** Режим плана: `collaborationMode: plan`, план - отдельным элементом в конце хода. */
  plan: boolean
}

/**
 * Свой раздел человека `[sandbox_workspace_write]` из настроек Codex (`config/read`): ещё
 * папки для записи и сеть. Ход называет песочницу целиком, поэтому чего здесь нет - «нет».
 */
export type CodexWorkspace = {
  writableRoots: string[]
  networkAccess: boolean
  excludeTmpdirEnvVar: boolean
  excludeSlashTmp: boolean
}

const NO_WORKSPACE: CodexWorkspace = {
  writableRoots: [],
  networkAccess: false,
  excludeTmpdirEnvVar: false,
  excludeSlashTmp: false,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Раздел из ответа `config/read`; нет его или ответа - ничего сверх папки проекта. */
export const workspaceFromConfig = (result: unknown): CodexWorkspace => {
  const config = isRecord(result) && isRecord(result['config']) ? result['config'] : {}
  const section = isRecord(config['sandbox_workspace_write'])
    ? config['sandbox_workspace_write']
    : {}
  const roots = section['writable_roots']

  return {
    writableRoots: Array.isArray(roots)
      ? roots.filter((root): root is string => typeof root === 'string' && root.trim() !== '')
      : [],
    networkAccess: section['network_access'] === true,
    excludeTmpdirEnvVar: section['exclude_tmpdir_env_var'] === true,
    excludeSlashTmp: section['exclude_slash_tmp'] === true,
  }
}

const READ_ONLY = { type: 'readOnly', networkAccess: false }

/**
 * Режим панели в режим Codex (как в amazing-codex): «спрашивать» - untrusted и запись в
 * папке проекта; «Авто» - on-request; «только чтение» - on-request без записи; план - только
 * чтение и режим плана;
 * «без вопросов» - never и полный доступ. «Авто» у Codex нет - это «принимать правки».
 * Запись в папке проекта - со своими папками и сетью человека (workspace).
 */
export const policyFor = (
  mode: PermissionMode,
  workspace: CodexWorkspace = NO_WORKSPACE,
): CodexPolicy => {
  const workspaceWrite = { type: 'workspaceWrite', ...workspace }

  switch (mode) {
    case 'default':
      return {
        approvalPolicy: 'untrusted',
        sandbox: 'workspace-write',
        sandboxPolicy: workspaceWrite,
        plan: false,
      }
    case 'readOnly':
      return {
        approvalPolicy: 'on-request',
        sandbox: 'read-only',
        sandboxPolicy: READ_ONLY,
        plan: false,
      }
    case 'plan':
      return {
        approvalPolicy: 'on-request',
        sandbox: 'read-only',
        sandboxPolicy: READ_ONLY,
        plan: true,
      }
    case 'bypassPermissions':
      return {
        approvalPolicy: 'never',
        sandbox: 'danger-full-access',
        sandboxPolicy: { type: 'dangerFullAccess' },
        plan: false,
      }
    default:
      return {
        approvalPolicy: 'on-request',
        sandbox: 'workspace-write',
        sandboxPolicy: workspaceWrite,
        plan: false,
      }
  }
}

/** Модель и усилие, которые уходят в `turn/start`; null - не передавать. */
export type CodexChoice = { model: string | null; effort: EffortLevel | null }

/**
 * Модель и усилие хода. Codex держит их «на этот ход и следующие», поэтому «по умолчанию»
 * после выбора едет явно: молча вкладка осталась бы на прошлом выборе. По умолчанию - из
 * настроек Codex для проекта (config), без них - модель каталога и её уровень; уровень из
 * настроек - только если выбранная модель его понимает.
 */
export const choiceOf = (
  conversation: Pick<Conversation, 'model' | 'effort'>,
  config: CodexChoice,
  modelInfo: (id: string | null) => ModelInfo | null,
): CodexChoice => {
  const model = conversation.model ?? config.model ?? modelInfo(null)?.value ?? null
  const info = model ? modelInfo(model) : null
  const fits = (effort: EffortLevel | null) =>
    effort !== null && (!info?.efforts || info.efforts.includes(effort))

  return {
    model,
    effort:
      conversation.effort ?? (fits(config.effort) ? config.effort : (info?.defaultEffort ?? null)),
  }
}

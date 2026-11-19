import type { CliNeed, EffortLevel, PermissionMode } from '@shared/conversation'
import type { ProviderId } from '@shared/providers'

import type { Environment } from '../process/shell-env'
import type { AcpLogin } from './acp-sign-in'
import type { AcpToolId, AcpToolLens } from './feed/acp-feed-builder'
import type { AcpConfigOption, AcpSessionSetup } from './protocol/acp-types'

/** Найденный CLI агента: путь и окружение оболочки входа человека. */
export type AcpCli = { binary: string; version: string; env: Environment }

/** Как поднять процесс агента: аргументы и переменные сверх окружения человека. */
export type AcpLaunch = { args: string[]; env: Record<string, string> }

/**
 * Агент ACP для ядра (ADR 0092): всё, чем агенты отличаются. Ядро (`main/acp`) ведёт процесс,
 * протокол, ленту и вопросы одинаково, а это описание даёт драйвер агента
 * (`main/antigravity`, `main/kimi`).
 */
export type AcpAgent = {
  provider: ProviderId
  /** Имя в журнале главного процесса. */
  tag: string
  /** CLI агента на этой машине; null - не найден. */
  locate: () => Promise<AcpCli | null>
  /**
   * Чего не хватает, когда locate - null: сам CLI на месте, а нет программы, без которой он не
   * работает (Kimi Code на Windows - Git Bash). null - не нашёлся сам CLI.
   */
  needs?: () => Promise<CliNeed | null>
  /**
   * Аргументы и окружение процесса: своя папка IDE, телеметрия. mode - режим разговора: у
   * `agy` «без вопросов» - флаг запуска, а не режим ACP.
   */
  launch: (mode: PermissionMode) => AcpLaunch
  /** Режимы IDE, которые даёт агент, по порядку меню. */
  modes: readonly PermissionMode[]
  /** Режим ACP (id режима агента) для режима IDE. */
  modeOf: (mode: PermissionMode) => string
  /** Режим IDE по режиму агента (агент сам перешёл, например, из плана). */
  modeFrom: (agentMode: string) => PermissionMode | null
  /** Уровень усилия IDE ↔ значение настройки размышления агента. */
  effortOf: (effort: EffortLevel, option: AcpConfigOption) => string | null
  effortsOf: (option: AcpConfigOption) => EffortLevel[]
  /** Своё агента о вызовах: имя инструмента, коннектор, вопрос, артефакт. */
  lens: (servers: readonly string[]) => AcpToolLens
  /** Устойчивая часть id вызова (у Kimi номер до двоеточия меняется при повторе). */
  toolId: AcpToolId
  /** Указания IDE панели (acp-briefing.ts): где агент работает и как человек ему отвечает. */
  briefing: string
  /**
   * Указания IDE полями `session/new` и `resume` (`agy`: `_meta.antigravity.systemPrompt.append`
   * - только дописать, ADR 0094). null - так агент не умеет: панель отдаёт их `prepare`, прогон -
   * первым сообщением. Заметка о редакторе идёт в сообщении, здесь - постоянное.
   */
  instructions: ((text: string) => Record<string, unknown>) | null
  /**
   * Подготовить свою папку агента до первого процесса: указания, которые агент берёт только с
   * диска (Kimi: профиль агента, `acp` не принимает ни `--agent-file`, ни поля сессии).
   */
  prepare?: () => Promise<void>
  /** Вход силами CLI агента: аргументы, окружение, ждёт ли он код со страницы входа. */
  login: () => AcpLogin
  /** Что агент сказал о входе в ответе сессии (`_meta`): тариф и где его поднять. */
  planOf?: (setup: AcpSessionSetup) => { plan: string; upgradeUrl: string } | null
  /**
   * Забыть пробную сессию каталога, которую агент не умеет удалить сам (`agy` без
   * `session/delete`): её файлы лежат в своей папке IDE.
   */
  forget?: (sessionId: string) => Promise<void>
  /** Новый разговор родился в папке: агенту, который сам её нигде не пишет (`agy`). */
  notePlace?: (sessionId: string, cwd: string) => Promise<void>
}

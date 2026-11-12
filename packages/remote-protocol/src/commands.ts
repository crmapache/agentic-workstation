import type { z } from 'zod'

import {
  CONVERSATION_ARGS,
  CONVERSATION_LIMITS,
  CONVERSATION_IN_PARTS,
} from './conversation-commands'
import { MACHINE_ARGS, MACHINE_LIMITS } from './machine-commands'
import { SCENARIO_ARGS, SCENARIO_LIMITS, SCENARIO_IN_PARTS } from './scenario-commands'

export { EFFORTS, IMAGE_TYPES, SEEN_RUN_STATES, PHONE_PERMISSION_MODES } from './command-fields'

/**
 * Что можно попросить с телефона - белый список. Канал пишет агенту, у которого шелл на
 * рабочей машине: всё, чего здесь нет, отказывается, в том числе команда, которой ещё не
 * существует. Решение по каждой команде ACC - таблица в ADR 0041 («Команды телефона»).
 *
 * Нельзя с телефона (решение владельца): терминал и `!`, правка файлов, плагины, настройки IDE
 * и провайдеров (режим по умолчанию, модель по умолчанию), режимы bypass, auto и dontAsk,
 * «разрешать всегда», пара и сам удалённый доступ, вход, которому нужен браузер на Mac
 * (аккаунт, коннектор), добавить и убрать коннектор, закрыть очередь, удалить worktree.
 */

/**
 * Аргументы каждой команды по областям. Лишние поля отбрасываются, кривые - отказ всей
 * команды. Ответ каждой влезает в один кадр - IDE урезает его сама (wire-types.ts).
 */
export const COMMAND_ARGS = { ...CONVERSATION_ARGS, ...SCENARIO_ARGS, ...MACHINE_ARGS } as const

export type CommandName = keyof typeof COMMAND_ARGS

export const COMMAND_NAMES = Object.keys(COMMAND_ARGS) as CommandName[]

export type CommandArgs<N extends CommandName> = z.output<(typeof COMMAND_ARGS)[N]>

/** Команда после проверки: имя и аргументы связаны типом. */
export type Command = { [N in CommandName]: { name: N; args: CommandArgs<N> } }[CommandName]

/**
 * Сколько раз в минуту устройство может просить одно и то же. Числа отвечают на вопрос, что
 * успеет телефон в чужих руках.
 */
export const COMMAND_LIMITS: Readonly<Record<CommandName, number>> = {
  ...CONVERSATION_LIMITS,
  ...SCENARIO_LIMITS,
  ...MACHINE_LIMITS,
}

/**
 * Что решено не пускать - явно, чтобы новое имя не стало доступным только потому, что про
 * список забыли. Тест держит: ни одно из них не попадает в белый список. Причины - ADR 0041.
 */
export const REFUSED_COMMANDS: readonly string[] = [
  'conversation.allowAlways',
  'conversation.setMode',
  'conversation.setDefaultMode',
  'conversation.close',
  'conversation.shell',
  'conversation.revertChanges',
  'conversation.fork',
  'conversation.readFleetAgent',
  'scenarios.close',
  'scenarios.save',
  'scenarios.place',
  'scenarios.worktreeRemove',
  'scenarios.openChat',
  'terminal.run',
  'files.write',
  'settings.set',
  'plugins.install',
  'plugins.list',
  'accounts.add',
  'accounts.signIn',
  'accounts.import',
  'connectors.add',
  'connectors.remove',
  'connectors.signIn',
  'connectors.setEnabled',
  'remote.setEnabled',
  'remote.approve',
  'remote.revoke',
  'voice.token',
]

/** Сообщение с картинками может прийти частями (см. parts.ts); всё прочее влезает в кадр. */
export const MAY_ARRIVE_IN_PARTS: ReadonlySet<CommandName> = new Set<CommandName>([
  ...CONVERSATION_IN_PARTS,
  ...SCENARIO_IN_PARTS,
])

/**
 * Сколько телефон ждёт итога долгих команд: вопрос сбоку (CLI ждёт ответа модели до 660 с),
 * поиск модели (до 150 с) и черновик сценария (до 600 с). Остальные - обычный срок телефона.
 * Итог IDE помнит COMMAND_MEMORY_MS: повтор после обрыва получит его, а не второй запуск.
 */
export const COMMAND_PATIENCE_MS: Readonly<Partial<Record<CommandName, number>>> = {
  'conversation.aside': 700_000,
  'conversation.searchAi': 180_000,
  'scenarios.draft': 640_000,
}

export const isCommandName = (name: unknown): name is CommandName =>
  typeof name === 'string' && Object.hasOwn(COMMAND_ARGS, name)

export type CommandRefusal = 'unknownCommand' | 'badArgs'

/** Имя из белого списка и аргументы по его схеме - или причина отказа. */
export const parseCommand = (
  name: unknown,
  args: unknown,
): { ok: true; command: Command } | { ok: false; code: CommandRefusal } => {
  if (!isCommandName(name)) return { ok: false, code: 'unknownCommand' }

  const parsed = COMMAND_ARGS[name].safeParse(args)

  return parsed.success
    ? { ok: true, command: { name, args: parsed.data } as Command }
    : { ok: false, code: 'badArgs' }
}

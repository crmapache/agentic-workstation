import type { ModelInfo, SlashCommand } from '@shared/conversation'

import type { CliMessage } from '../cli/cli-messages'
import { isRecord, stringField, recordsField } from '../cli/cli-messages'

/** Команды из `system/init`: только имена, описаний там нет. */
export const commandsFromInit = (init: CliMessage): SlashCommand[] => {
  const names = init['slash_commands']

  return Array.isArray(names)
    ? names
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
        .map((name) => ({ name, description: '', argumentHint: '' }))
    : []
}

/**
 * Команды из `system/commands_changed`, ответа на `reload_plugins` или `initialize`: полный
 * список с описаниями и подсказкой аргументов, им список и заменяется. Поля `commands` нет -
 * null: это «новостей нет», а не «команд не осталось».
 */
export const commandsFromChange = (message: CliMessage): SlashCommand[] | null =>
  Array.isArray(message['commands'])
    ? recordsField(message, 'commands')
        .map((command) => ({
          name: stringField(command, 'name'),
          description: stringField(command, 'description'),
          argumentHint: stringField(command, 'argumentHint'),
          ...(command['builtin'] === true && { builtin: true }),
        }))
        .filter((command) => command.name.length > 0)
    : null

/** Свои команды CLI из ответа на `initialize`: служебный процесс без разговора их знает. */
export const builtinsFromReply = (reply: unknown): SlashCommand[] =>
  isRecord(reply)
    ? (commandsFromChange({ type: '', ...reply }) ?? []).filter((command) => command.builtin)
    : []

/**
 * Свежий список команд поверх известного: описание из старого списка или из своих команд
 * CLI не теряется, если новый (из init) пришёл только с именами.
 */
export const mergeCommands = (known: SlashCommand[], incoming: SlashCommand[]): SlashCommand[] => {
  const described = new Map(known.map((command) => [command.name, command]))

  return incoming.map((command) =>
    command.description ? command : (described.get(command.name) ?? command),
  )
}

/** Каталог моделей из ответа на `list_models`. Отключённые модели в него не идут. */
export const modelsFromReply = (reply: unknown): ModelInfo[] =>
  isRecord(reply)
    ? recordsField(reply, 'models')
        .filter((model) => model['disabled'] !== true)
        .map((model) => ({
          value: stringField(model, 'value'),
          displayName: stringField(model, 'displayName') || stringField(model, 'value'),
          description: stringField(model, 'description'),
          // Быстрый режим и во что CLI разворачивает выбор - для меню MODEL и судьбы выбора.
          ...(typeof model['supportsFastMode'] === 'boolean' && {
            fast: model['supportsFastMode'],
          }),
          ...(stringField(model, 'resolvedModel') && {
            resolved: stringField(model, 'resolvedModel'),
          }),
        }))
        .filter((model) => model.value.length > 0)
    : []

/** Заголовок из ответа на `generate_session_title`. */
export const titleFromReply = (reply: unknown): string =>
  isRecord(reply) ? stringField(reply, 'title').trim() : ''

/** Применённый режим из ответа на `set_permission_mode`: ему и верим. */
export const modeFromReply = (reply: unknown): string =>
  isRecord(reply) ? stringField(reply, 'mode') : ''

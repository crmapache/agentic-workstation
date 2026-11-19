import type { UiNode } from '@shared/extension-ui'
import type {
  ExtensionHook,
  ExtensionGrant,
  ExtensionManifest,
  ExtensionViewPlace,
  ExtensionStatusItem,
  ExtensionContributions,
} from '@shared/extensions'

/** Команда расширения: колбэк в песочнице по номеру. */
export type RuntimeCommand = { title: string; keys: string | null; handler: number }

export type RuntimeView = {
  title: string
  icon: string
  place: ExtensionViewPlace
  badge: number
  tree: UiNode | null
  revision: number
  /** Колбэк событий вида; 0 - вид никого не слушает. */
  listener: number
}

/** Инструмент для ИИ: схема входа и колбэк. */
export type RuntimeTool = {
  description: string
  inputSchema: Record<string, unknown>
  readOnly: boolean
  handler: number
}

/**
 * Запущенное расширение со стороны IDE (ADR 0091): что оно внесло - команды, виды, пункты
 * строки состояния, инструменты, хуки, тема. Остановка снимает всё разом: IDE забывает этот
 * объект, и окно получает состояние без его вклада.
 */
export class ExtensionRuntime {
  readonly commands = new Map<string, RuntimeCommand>()
  readonly views = new Map<string, RuntimeView>()
  readonly statusItems = new Map<string, ExtensionStatusItem>()
  readonly tools = new Map<string, RuntimeTool>()
  /** Хуки по номеру колбэка: один колбэк - один хук. */
  readonly hooks = new Map<number, ExtensionHook | 'settings'>()
  theme: Record<string, string> | null = null
  stopped = false

  constructor(
    readonly manifest: ExtensionManifest,
    /** Действующие права: и просьба манифеста, и выдано человеком. */
    readonly grant: ExtensionGrant,
  ) {}

  get id(): string {
    return this.manifest.id
  }

  /** Ключ вклада на всю IDE: `<расширение>.<имя>`. */
  key(local: string): string {
    return `${this.id}.${local}`
  }

  handlersOf(hook: ExtensionHook | 'settings'): number[] {
    return [...this.hooks].filter(([, kind]) => kind === hook).map(([handler]) => handler)
  }

  contributions(): ExtensionContributions {
    return {
      commands: [...this.commands].map(([local, command]) => ({
        key: this.key(local),
        title: command.title,
        keys: command.keys,
      })),
      views: [...this.views].map(([local, view]) => ({
        key: this.key(local),
        title: view.title,
        icon: view.icon,
        place: view.place,
        badge: view.badge,
      })),
      statusItems: [...this.statusItems.values()],
      tools: [...this.tools].map(([name, tool]) => ({
        name: this.toolName(name),
        title: tool.description.split('\n')[0]?.slice(0, 120) ?? name,
        readOnly: tool.readOnly,
      })),
      hooks: [
        ...new Set(
          [...this.hooks.values()].filter((hook): hook is ExtensionHook => hook !== 'settings'),
        ),
      ],
    }
  }

  /**
   * Имя инструмента для ИИ в коннекторе extensions: id расширения и имя, через «_» (дефисы
   * id - тоже «_»: так имя проходит у всех трёх провайдеров).
   */
  toolName(name: string): string {
    return `${this.id.replaceAll('-', '_')}_${name}`
  }
}

/** Ключ вклада `<расширение>.<имя>` - на две части по первой точке. */
export const splitKey = (key: string): [string, string] => {
  const at = key.indexOf('.')

  return at < 0 ? [key, ''] : [key.slice(0, at), key.slice(at + 1)]
}

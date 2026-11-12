import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

import { numberArg, stringArg, booleanArg, ArgumentError, stringListArg } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { BrowserAgent } from '../../../browser/browser-agent'
import type { Page } from '../../../browser/page'
import {
  click,
  hover,
  press,
  scroll,
  typeText,
  fillField,
  uploadFiles,
  selectOptions,
} from '../../../browser/page-actions'
import type { MouseButton } from '../../../browser/page-actions'
import { realPathInside } from '../../../browser/project-files'
import {
  refArg,
  schema,
  tabArg,
  pointArg,
  agentCall,
  targetArg,
  referenceOf,
  REF_PROPERTY,
  TAB_PROPERTY,
  POINT_PROPERTIES,
} from './browser-args'

const BUTTONS: readonly MouseButton[] = ['left', 'right', 'middle']

/** После действия: страница могла перейти - дождаться и сказать, где вкладка теперь. */
const act = async (page: Page, run: () => Promise<unknown>) => {
  const before = (await page.info())?.url ?? ''

  await run()

  const { url, title } = await page.settle(before)

  return { tab: referenceOf(page), url, title, ...(url !== before ? { navigated: true } : {}) }
}

/** Поля формы: [{ ref, value }]. */
const fieldsArg = (args: Record<string, unknown>): { ref: string; value: string }[] => {
  const value = args['fields']

  if (!Array.isArray(value) || !value.length)
    throw new ArgumentError('"fields" must be a list of { ref, value }.')

  return value.map((item: unknown) => {
    const field = (item ?? {}) as Record<string, unknown>

    const raw = field['value']
    const text =
      typeof raw === 'string'
        ? raw
        : typeof raw === 'number' || typeof raw === 'boolean'
          ? String(raw)
          : ''

    return { ref: refArg(field, true), value: text }
  })
}

/** Клавиши: строка через пробел или список. */
const keysArg = (args: Record<string, unknown>): string[] => {
  const keys = stringListArg(args, 'keys').flatMap((item) => item.trim().split(/\s+/))

  if (!keys.length)
    throw new ArgumentError('"keys" is required, like "Enter" or "ControlOrMeta+A".')

  return keys
}

const outsideProject = (file: string, workDir: string) =>
  `"${file}" is outside this conversation's project folder (${workDir}). Upload sends only files from that folder, so a web page can't make you send other files from this Mac. If the user wants this file uploaded, ask them to put it into the project.`

/**
 * Файлы для поля загрузки: существующие файлы внутри папки разговора (проект, у сценария -
 * worktree), по настоящему пути после ссылок. Страница может уговорить модель «приложить»
 * ~/.ssh/id_ed25519 - поэтому всё остальное с диска загрузка не берёт. Ответ - настоящие пути:
 * подмена ссылки между проверкой и чтением Chrome ничего не даст.
 */
const filesArg = async (args: Record<string, unknown>, workDir: string | null) => {
  const files = stringListArg(args, 'files')

  if (!files.length) throw new ArgumentError('"files" must list absolute file paths.')

  if (!workDir) {
    throw new ArgumentError("Upload needs a conversation's project folder, and this call has none.")
  }

  const real: string[] = []

  for (const file of files) {
    const info = isAbsolute(file) ? await stat(file).catch(() => null) : null

    if (!info?.isFile())
      throw new ArgumentError(`"${file}" is not an existing file (absolute path).`)

    const inside = await realPathInside(workDir, file)

    if (!inside) throw new ArgumentError(outsideProject(file, workDir))

    real.push(inside)
  }

  return real
}

/** Мышь и клавиатура во вкладке: курсор агента подъезжает перед нажатием. */
export const BROWSER_INPUT_TOOLS: NativeTool<BrowserAgent>[] = [
  {
    name: 'click',
    description:
      'Click an element by ref (from the snapshot) or at x,y: your pointer moves there like a hand and clicks. double for a double click, button "right" for the context menu.',
    access: 'write',
    inputSchema: schema({
      ...TAB_PROPERTY,
      ...REF_PROPERTY,
      ...POINT_PROPERTIES,
      double: { type: 'boolean' },
      button: { type: 'string', enum: [...BUTTONS] },
    }),
    run: async (args, agent, call) => {
      const page = await agent.page(agentCall(call), tabArg(args))
      const target = targetArg(args)
      const button = (stringArg(args, 'button') ?? 'left') as MouseButton

      if (!BUTTONS.includes(button)) throw new ArgumentError('"button" is left, right or middle.')

      return act(page, () =>
        click(page, target, { button, double: booleanArg(args, 'double', false) }),
      )
    },
  },
  {
    name: 'type',
    description:
      'Type text into an element (ref): clicks it, replaces its content (append keeps it), types. submit presses Enter after. slowly types key by key - for fields that react to each key (suggestions). Without ref types into the focused element.',
    access: 'write',
    inputSchema: schema(
      {
        ...TAB_PROPERTY,
        ...REF_PROPERTY,
        text: { type: 'string' },
        submit: { type: 'boolean' },
        slowly: { type: 'boolean' },
        append: { type: 'boolean' },
      },
      ['text'],
    ),
    run: async (args, agent, call) => {
      const page = await agent.page(agentCall(call), tabArg(args))
      const text = typeof args['text'] === 'string' ? args['text'] : ''
      const ref = refArg(args)

      return act(page, () =>
        typeText(page, {
          text,
          ...(ref ? { ref } : {}),
          submit: booleanArg(args, 'submit', false),
          slowly: booleanArg(args, 'slowly', false),
          append: booleanArg(args, 'append', false),
        }),
      )
    },
  },
  {
    name: 'fill',
    description:
      'Fill several form fields in one call, the way a person does: your pointer goes to each field in turn, types text, ticks checkboxes and radios, picks options. fields = [{ ref, value }]. Text fields take the text, checkboxes and radios take true or false, selects take an option value or label.',
    access: 'write',
    inputSchema: schema(
      {
        ...TAB_PROPERTY,
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: { ref: { type: 'string' }, value: { type: 'string' } },
            required: ['ref', 'value'],
          },
        },
      },
      ['fields'],
    ),
    run: async (args, agent, call) => {
      const page = await agent.page(agentCall(call), tabArg(args))
      const fields = fieldsArg(args)

      return act(page, async () => {
        for (const field of fields) await fillField(page, field.ref, field.value)
      })
    },
  },
  {
    name: 'press',
    description:
      'Press keys or combinations in a tab, one after another: "Enter", "Escape", "Tab", "ArrowDown", "ControlOrMeta+A" (select all: Meta on this Mac), "Meta+Shift+K". Several - separated by spaces.',
    access: 'write',
    inputSchema: schema({ ...TAB_PROPERTY, keys: { type: 'string' } }, ['keys']),
    run: async (args, agent, call) => {
      const page = await agent.page(agentCall(call), tabArg(args))
      const keys = keysArg(args)

      return act(page, () => press(page, keys))
    },
  },
  {
    name: 'hover',
    description:
      'Move the pointer over an element (ref) or to x,y - for menus and tooltips that open on hover.',
    access: 'write',
    inputSchema: schema({ ...TAB_PROPERTY, ...REF_PROPERTY, ...POINT_PROPERTIES }),
    run: async (args, agent, call) => {
      const page = await agent.page(agentCall(call), tabArg(args))
      const target = targetArg(args)

      return act(page, () => hover(page, target))
    },
  },
  {
    name: 'scroll',
    description:
      'Scroll a tab: to an element (ref only), or by deltaY / deltaX pixels with the wheel at an element, at x,y or in the middle of the page. Positive deltaY scrolls down.',
    access: 'write',
    inputSchema: schema({
      ...TAB_PROPERTY,
      ...REF_PROPERTY,
      ...POINT_PROPERTIES,
      deltaX: { type: 'number' },
      deltaY: { type: 'number' },
    }),
    run: async (args, agent, call) => {
      const page = await agent.page(agentCall(call), tabArg(args))
      const ref = refArg(args)
      const point = pointArg(args)
      const limits = { min: -100_000, max: 100_000, fallback: 0 }

      return act(page, () =>
        scroll(page, {
          ...(ref ? { ref } : {}),
          ...(point ? { point } : {}),
          dx: numberArg(args, 'deltaX', limits),
          dy: numberArg(args, 'deltaY', limits),
        }),
      )
    },
  },
  {
    name: 'select',
    description:
      'Choose options in a <select> element (ref) by value or visible label: your pointer goes to it and picks. For custom dropdowns click them instead.',
    access: 'write',
    inputSchema: schema(
      { ...TAB_PROPERTY, ...REF_PROPERTY, values: { type: 'array', items: { type: 'string' } } },
      ['ref', 'values'],
    ),
    run: async (args, agent, call) => {
      const page = await agent.page(agentCall(call), tabArg(args))
      const ref = refArg(args, true)
      const values = stringListArg(args, 'values')
      let selected: string[] = []

      const result = await act(page, async () => {
        selected = await selectOptions(page, ref, values)
      })

      return { ...result, selected }
    },
  },
  {
    // Ступень отправки (выключена, пока её не включит человек): загрузка уносит файл с этой
    // машины на сайт, и страница может об этом попросить сама.
    name: 'upload',
    description:
      "Put files into a file input element (ref) - no system file dialog. Only files inside this conversation's project folder (absolute paths).",
    access: 'outbound',
    inputSchema: schema(
      { ...TAB_PROPERTY, ...REF_PROPERTY, files: { type: 'array', items: { type: 'string' } } },
      ['ref', 'files'],
    ),
    run: async (args, agent, call) => {
      const at = agentCall(call)
      const ref = refArg(args, true)
      const files = await filesArg(args, at.workDir)
      const page = await agent.page(at, tabArg(args))

      return act(page, () => uploadFiles(page, ref, files))
    },
  },
]

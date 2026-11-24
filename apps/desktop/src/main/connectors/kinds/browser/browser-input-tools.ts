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
import type { FieldCheck, MouseButton } from '../../../browser/page-actions'
import { realPathInside } from '../../../browser/project-files'
import {
  refArg,
  schema,
  tabArg,
  pointArg,
  agentCall,
  expectArg,
  targetArg,
  referenceOf,
  REF_PROPERTY,
  TAB_PROPERTY,
  POINT_PROPERTIES,
} from './browser-args'
import { typedAnswer } from './browser-typed'

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
    // Проверка попадания (ADR 0119): ref, ушедший из-под мыши, не нажимается; x,y в кнопку,
    // ссылку, пункт меню или поле - только с expect; ответ говорит, что нажато.
    name: 'click',
    description:
      'Click an element by ref from the snapshot (the main way) or at x,y: your pointer moves there like a hand and clicks. Right before the press it checks what is under the pointer: a ref that moved or got covered is not clicked. At x,y a button, link, menu item or field needs expect, otherwise nothing is clicked. The answer names what was clicked (clicked): check it is what you meant. double for a double click, button "right" for the context menu.',
    access: 'write',
    inputSchema: schema({
      ...TAB_PROPERTY,
      ...REF_PROPERTY,
      ...POINT_PROPERTIES,
      expect: {
        type: 'string',
        description:
          'The whole label of what you mean to click, like "Accept": the press goes only if the element under the pointer has exactly this name (case, extra spaces and a trailing "…" or ":" do not matter). Needed at x,y for buttons, links, menu items and fields.',
      },
      double: { type: 'boolean' },
      button: { type: 'string', enum: [...BUTTONS] },
    }),
    run: async (args, agent, call) => {
      const page = await agent.page(agentCall(call), tabArg(args))
      const target = targetArg(args)
      const button = (stringArg(args, 'button') ?? 'left') as MouseButton
      const expect = expectArg(args)
      let clicked = ''

      if (!BUTTONS.includes(button)) throw new ArgumentError('"button" is left, right or middle.')

      const result = await act(page, async () => {
        clicked = await click(page, target, {
          button,
          double: booleanArg(args, 'double', false),
          expect,
        })
      })

      return { clicked, ...result }
    },
  },
  {
    // Перевод строки - Shift+Enter, многострочный текст с submit - отказ, ответ редактора - его
    // текст по строкам и картинка (ADR 0095): сообщение людям не уходит вслепую.
    name: 'type',
    description:
      'Type text into an element (ref): clicks it, replaces its content (append keeps it), types. Without ref types into the focused element. A line break in text is Shift+Enter (a blank line is two), never Enter, so a chat does not send early. Into a rich editor (a chat composer) without submit it answers with what the field reads, line by line (trust it over innerText, which doubles line breaks in chat editors), and a picture of the field: before you send a message with Enter (press), check them - the lines, the blank lines, the right chat. submit presses Enter after one-line text only. slowly types key by key - for fields that react to each key (suggestions).',
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
      let check: FieldCheck | null = null

      const result = await act(page, async () => {
        check = await typeText(page, {
          text,
          ...(ref ? { ref } : {}),
          submit: booleanArg(args, 'submit', false),
          slowly: booleanArg(args, 'slowly', false),
          append: booleanArg(args, 'append', false),
          picture: true,
        })
      })

      return check ? typedAnswer(result, check) : result
    },
  },
  {
    name: 'fill',
    description:
      'Fill several form fields in one call, the way a person does: your pointer goes to each field in turn, types text, ticks checkboxes and radios, picks options. fields = [{ ref, value }]. Text fields take the text (a line break is Shift+Enter, as in type), checkboxes and radios take true or false, selects take an option value or label. The answer has fieldText - what rich editors and multi-line fields read now.',
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

      const fieldText: Record<string, string> = {}

      const result = await act(page, async () => {
        for (const field of fields) {
          const check = await fillField(page, field.ref, field.value)

          if (check) fieldText[field.ref] = check.text
        }
      })

      return Object.keys(fieldText).length ? { ...result, fieldText } : result
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

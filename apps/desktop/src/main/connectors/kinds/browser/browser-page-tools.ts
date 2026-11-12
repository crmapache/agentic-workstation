import { formatTabReference } from '@agentic-workstation/browser-protocol/tab-reference'

import { numberArg, stringArg, ToolOutput, ArgumentError } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { BrowserAgent } from '../../../browser/browser-agent'
import { BrowserError } from '../../../browser/browser-error'
import type { Page } from '../../../browser/page'
import { waitFor, evaluate } from '../../../browser/page-read'
import { SCRIPTED_NOTE } from '../../../browser/page-scripted'
import {
  refArg,
  schema,
  tabArg,
  urlArg,
  agentCall,
  allowedUrl,
  referenceOf,
  REF_PROPERTY,
  TAB_PROPERTY,
} from './browser-args'

/** Переход загружается не дольше: дальше модель получает ответ, а страница грузится сама. */
const NAVIGATE_SETTLE_MS = 30_000

/** Где вкладка теперь: ссылка, адрес, заголовок. */
const where = async (page: Page, settleMs = NAVIGATE_SETTLE_MS) => {
  const { url, title } = await page.settle('', settleMs)

  return { tab: referenceOf(page), url, title }
}

type History = { currentIndex: number; entries: { id: number; url: string }[] }

/** Шаг по истории вкладки: -1 назад, 1 вперёд. */
const historyStep = async (page: Page, step: -1 | 1) => {
  const history = await page.cdp<History>('Page.getNavigationHistory')
  const entry = history.entries[history.currentIndex + step]

  if (!entry)
    throw new BrowserError(
      'bad-request',
      step < 0 ? 'There is no previous page.' : 'There is no next page.',
    )

  await page.cdp('Page.navigateToHistoryEntry', { entryId: entry.id })

  return where(page)
}

/** Вкладки, переходы и конец работы. */
export const BROWSER_PAGE_TOOLS: NativeTool<BrowserAgent>[] = [
  {
    name: 'open',
    description:
      "Open a new tab in the user's Chrome, in this conversation's own tab group: a URL or a blank tab. It opens in the background - the user's current tab and focus stay. The new tab becomes your current tab.",
    access: 'write',
    inputSchema: schema({
      url: {
        type: 'string',
        description:
          'Address to open. Empty - a blank tab. file: addresses only for files inside the project folder.',
      },
      profile: {
        type: 'string',
        description: 'Chrome profile key or name, when several are connected (see "profiles").',
      },
    }),
    run: async (args, agent, call) => {
      const at = agentCall(call)
      const url = await allowedUrl(urlArg(args['url']), at.workDir)
      const page = await agent.open(at, url, stringArg(args, 'profile'))

      return where(page, 0)
    },
  },
  {
    name: 'take',
    description:
      'Start working in one of the user\'s tabs by its reference (chrome-tab:<profile>/<id>@<launch>, the user copies it with "Copy tab reference for AI", or take it from "tabs"). Pass the reference with the title after it, as the user gave it. The tab stays where it is and gets an orange frame while you work.',
    access: 'write',
    inputSchema: schema({ ...TAB_PROPERTY }, ['tab']),
    run: async (args, agent, call) => {
      const wanted = tabArg(args)

      if (!wanted) throw new ArgumentError('"tab" is required.')

      return where(await agent.page(agentCall(call), wanted), 0)
    },
  },
  {
    name: 'navigate',
    description:
      'Go to a URL in a tab and wait for the page to load. file: addresses only for files inside the project folder.',
    access: 'write',
    inputSchema: schema({ ...TAB_PROPERTY, url: { type: 'string' } }, ['url']),
    run: async (args, agent, call) => {
      const at = agentCall(call)
      const url = await allowedUrl(urlArg(args['url']), at.workDir)

      if (!url) throw new ArgumentError('"url" is required.')

      const page = await agent.page(at, tabArg(args))
      const result = await page.cdp<{ errorText?: string }>('Page.navigate', { url })

      if (result.errorText)
        throw new BrowserError('failed', `Navigation failed: ${result.errorText}`)

      return where(page)
    },
  },
  {
    name: 'back',
    description: 'Go back in the history of a tab.',
    access: 'write',
    inputSchema: schema({ ...TAB_PROPERTY }),
    run: async (args, agent, call) =>
      historyStep(await agent.page(agentCall(call), tabArg(args)), -1),
  },
  {
    name: 'forward',
    description: 'Go forward in the history of a tab.',
    access: 'write',
    inputSchema: schema({ ...TAB_PROPERTY }),
    run: async (args, agent, call) =>
      historyStep(await agent.page(agentCall(call), tabArg(args)), 1),
  },
  {
    name: 'reload',
    description: 'Reload a tab.',
    access: 'write',
    inputSchema: schema({ ...TAB_PROPERTY }),
    run: async (args, agent, call) => {
      const page = await agent.page(agentCall(call), tabArg(args))

      await page.cdp('Page.reload', {})

      return where(page)
    },
  },
  {
    name: 'wait',
    description:
      'Wait until a text appears (text) or disappears (textGone) on the page, or just wait some seconds.',
    access: 'write',
    inputSchema: schema({
      ...TAB_PROPERTY,
      text: { type: 'string', description: 'Wait until this text is on the page.' },
      textGone: { type: 'string', description: 'Wait until this text is gone from the page.' },
      seconds: { type: 'number', description: 'Just wait this long (without text or textGone).' },
      timeout: {
        type: 'number',
        description: 'Give up after this many seconds (default 10, max 60).',
      },
    }),
    run: async (args, agent, call) => {
      const page = await agent.page(agentCall(call), tabArg(args))
      const text = stringArg(args, 'text')
      const textGone = stringArg(args, 'textGone')
      const result = await waitFor(page, {
        ...(text ? { text } : {}),
        ...(textGone ? { textGone } : {}),
        seconds: numberArg(args, 'seconds', { min: 0, max: 60, fallback: 1 }),
        timeoutMs: numberArg(args, 'timeout', { min: 1, max: 60, fallback: 10 }) * 1000,
      })

      return new ToolOutput({ content: [{ type: 'text', text: result }] })
    },
  },
  {
    name: 'evaluate',
    description:
      'Run JavaScript in the page to read or compute something and return the value as JSON (promises are awaited). Not for acting on the page: the user watches your pointer, and a script clicks, types and picks invisibly and instantly - use click, type, fill, select and press for that. Without ref - an expression in the main frame, like document.title. With ref - a function that gets the element and runs in its frame, like (el) => el.outerHTML.',
    access: 'write',
    inputSchema: schema({ ...TAB_PROPERTY, expression: { type: 'string' }, ...REF_PROPERTY }, [
      'expression',
    ]),
    run: async (args, agent, call) => {
      const page = await agent.page(agentCall(call), tabArg(args))
      const { text, scripted } = await evaluate(
        page,
        stringArg(args, 'expression', true),
        refArg(args),
      )

      return new ToolOutput({
        content: [
          { type: 'text', text },
          ...(scripted ? [{ type: 'text' as const, text: SCRIPTED_NOTE }] : []),
        ],
      })
    },
  },
  {
    name: 'close_tab',
    description:
      'Close a tab you opened or took (default: your current tab). Works even when Chrome does not let the agent control the page.',
    access: 'write',
    inputSchema: schema({ ...TAB_PROPERTY }),
    run: async (args, agent, call) => {
      const tab = await agent.closeTab(agentCall(call), tabArg(args))

      return {
        closed: formatTabReference({
          profileKey: tab.profileKey,
          tabId: tab.tabId,
          launch: tab.launch || null,
        }),
      }
    },
  },
  {
    name: 'finish',
    description:
      'Finish your work in the browser: close the tabs you opened and your tab group, release the tabs you took (no frame, no debugger). Call it when the browser part of the task is done.',
    access: 'write',
    inputSchema: schema({}),
    run: (_args, agent, call) => agent.finishCall(agentCall(call)),
  },
]

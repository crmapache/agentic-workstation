import { numberArg, stringArg, booleanArg, ToolOutput } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { BrowserAgent } from '../../../browser/browser-agent'
import { BrowserError } from '../../../browser/browser-error'
import { isProfileNamed } from '../../../browser/browser-hub'
import { formatConsole } from '../../../browser/console-log'
import { snapshot, pageHeader, screenshot } from '../../../browser/page-read'
import { schema, tabArg, agentCall, TAB_PROPERTY } from './browser-args'
import { tabLines } from './browser-tab-list'

/** Инструменты чтения браузера: профили, вкладки, снимок, картинка, консоль. */
export const BROWSER_READ_TOOLS: NativeTool<BrowserAgent>[] = [
  {
    name: 'profiles',
    description:
      'List the Chrome profiles connected to Agentic Workstation: key, name, the Chrome profile it is (as the user sees it in Chrome), browser.',
    access: 'read',
    inputSchema: schema({}),
    run: (_args, agent) =>
      Promise.resolve(
        agent.profiles().map(({ key, name, chromeProfile, browser }) => ({
          profile: key,
          name,
          chromeProfile,
          browser,
        })),
      ),
  },
  {
    name: 'tabs',
    description:
      'List open tabs of the connected Chrome profiles (or one profile), one line per tab: reference, title, URL, active, tab group, and whether you already hold it. Filter with "query" on long lists. Pass a reference to "take" or to any tool\'s "tab" to work in that tab.',
    access: 'read',
    inputSchema: schema({
      profile: {
        type: 'string',
        description: 'Profile key, name or Chrome profile. Default: all profiles.',
      },
      query: {
        type: 'string',
        description: 'Only tabs whose title or URL contains this text (any case).',
      },
      limit: { type: 'number', description: 'At most this many tabs (default 50, max 200).' },
    }),
    run: async (args, agent, call) => {
      const wanted = stringArg(args, 'profile')
      const session = agent.session(agentCall(call))
      const profiles = agent
        .profiles()
        .filter((profile) => !wanted || isProfileNamed(profile, wanted))

      if (!profiles.length)
        throw new BrowserError('profile-offline', 'No matching Chrome profile is connected.')

      const listings = await Promise.all(
        profiles.map(async (profile) => ({
          profile,
          listing: await agent.hub.request(profile.key, 'tabs.list', {}, { signal: call.signal }),
        })),
      )
      const text = tabLines(listings, {
        query: stringArg(args, 'query') ?? '',
        limit: numberArg(args, 'limit', { min: 1, max: 200, fallback: 50 }),
        holderOf: (key) => {
          const holder = agent.sessions.holderOf(key)

          return holder ? (holder === session ? 'you' : 'another conversation') : null
        },
      })

      return new ToolOutput({ content: [{ type: 'text', text }] })
    },
  },
  {
    name: 'snapshot',
    description:
      'Accessibility snapshot of a tab as text: roles, names, states and element refs like [ref=e12]. Frames (iframes, including cross-origin ones: payment fields, embedded sign-ins, widgets) are shown under their iframe line marked [frame=f2], and their element refs carry the frame, like f2e7. Use the refs with click, type, fill, hover, scroll, select, upload, evaluate. Refs stay valid until the next snapshot of that tab or until the page changes its address.',
    access: 'read',
    inputSchema: schema({ ...TAB_PROPERTY }),
    run: async (args, agent, call) => {
      const page = await agent.page(agentCall(call), tabArg(args))

      return new ToolOutput({ content: [{ type: 'text', text: await snapshot(page) }] })
    },
  },
  {
    name: 'screenshot',
    description:
      'Screenshot of a tab: the visible part, or the page from the top with fullPage (very long pages are cut). At most 2000 px on the long side. Use snapshot to find elements; a screenshot is for checking how the page looks.',
    access: 'read',
    inputSchema: schema({
      ...TAB_PROPERTY,
      fullPage: {
        type: 'boolean',
        description: 'The page from the top, not only the visible part.',
      },
    }),
    run: async (args, agent, call) => {
      const page = await agent.page(agentCall(call), tabArg(args))
      const header = await pageHeader(page)

      try {
        const shot = await screenshot(page, booleanArg(args, 'fullPage', false))

        return new ToolOutput({
          content: [
            { type: 'image', data: shot.data, mimeType: shot.mimeType },
            { type: 'text', text: shot.note ? `${header}\n${shot.note}` : header },
          ],
        })
      } catch (error) {
        // Chrome не рисует скрытую вкладку (фон, свёрнутое окно) - тогда хотя бы дерево.
        if (!(error instanceof BrowserError)) throw error

        const text = `Chrome did not paint this tab (${error.message}), so there is no picture. The snapshot instead:\n\n${await snapshot(page)}`

        return new ToolOutput({ content: [{ type: 'text', text }] })
      }
    },
  },
  {
    name: 'console',
    description:
      'Recent console messages of a tab (logs, warnings, errors, answered dialogs) since you started working in it. Long output keeps the newest messages.',
    access: 'read',
    inputSchema: schema({
      ...TAB_PROPERTY,
      limit: { type: 'number', description: 'How many last messages (default 50).' },
      onlyErrors: { type: 'boolean', description: 'Only errors.' },
    }),
    run: async (args, agent, call) => {
      const page = await agent.page(agentCall(call), tabArg(args))
      const text = formatConsole(
        page.tab.console,
        numberArg(args, 'limit', { min: 1, max: 200, fallback: 50 }),
        booleanArg(args, 'onlyErrors', false),
      )

      return new ToolOutput({ content: [{ type: 'text', text: text || '(no console messages)' }] })
    },
  },
]

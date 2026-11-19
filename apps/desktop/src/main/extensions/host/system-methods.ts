import { hostAllowed } from '../manifest/grants'
import { list, text, count, record, anyText, HostArgError, optionalText } from './host-args'
import type { HostMethod } from './host-types'
import { projectOf, projectFile } from './project-files'

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
/** Заголовки, которые ставит сама сеть: расширение их не задаёт. */
const FORBIDDEN_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'cookie',
])
const BODY_MAX_CHARS = 5 * 1024 * 1024

const urlOf = (value: string): URL => {
  try {
    return new URL(value)
  } catch {
    throw new HostArgError('"url" is not a valid address.')
  }
}

const headersOf = (raw: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(raw).map(([name, value]) => {
      const lower = name.toLowerCase()

      if (!/^[a-z0-9!#$%&'*+.^_`|~-]{1,64}$/.test(lower) || FORBIDDEN_HEADERS.has(lower)) {
        throw new HostArgError(`Header "${name}" is not allowed.`)
      }

      if (typeof value !== 'string' || /[\r\n]/.test(value) || value.length > 8000) {
        throw new HostArgError(`Header "${name}" must be a one-line string.`)
      }

      return [lower, value]
    }),
  )

/** Сеть (network, только объявленные хосты), программы (shell, только объявленные), буфер. */
export const SYSTEM_METHODS: Record<string, HostMethod> = {
  'net.fetch': {
    permission: 'network',
    run: (call) => {
      const url = urlOf(text(call.args, 'url', 8000))
      const method = (optionalText(call.args, 'method', 10) ?? 'GET').toUpperCase()

      if (url.protocol !== 'https:' && url.protocol !== 'http:')
        throw new HostArgError('Only http and https work.')
      if (url.username || url.password)
        throw new HostArgError('Put credentials in headers, not in the address.')
      if (!hostAllowed(call.runtime.grant.hosts, url.hostname)) {
        throw new HostArgError(`"${url.hostname}" is not in network.hosts of extension.json.`)
      }

      if (!METHODS.includes(method)) throw new HostArgError(`Unknown method "${method}".`)

      const body =
        call.args['body'] === undefined || call.args['body'] === null
          ? null
          : anyText(call.args, 'body', BODY_MAX_CHARS)

      return call.context.fetch(
        url,
        { method, headers: headersOf(record(call.args, 'headers')), body },
        (hostname) => hostAllowed(call.runtime.grant.hosts, hostname),
      )
    },
  },
  'shell.run': {
    permission: 'shell',
    run: async (call) => {
      const command = text(call.args, 'command', 64)

      if (!call.runtime.grant.commands.includes(command)) {
        throw new HostArgError(`"${command}" is not in shell.commands of extension.json.`)
      }

      const args = list(call.args, 'args').map((arg) => {
        if (typeof arg !== 'string' || arg.length > 10_000)
          throw new HostArgError('"args" must be strings.')

        return arg
      })

      if (args.length > 200) throw new HostArgError('Too many arguments.')

      const cwd =
        optionalText(call.args, 'path', 4000) === null
          ? projectOf(call).path
          : (await projectFile(call, { allowRoot: true })).absolute

      return call.context.run(command, args, {
        cwd,
        timeoutMs: count(call.args, 'timeoutMs', { min: 1000, max: 600_000, fallback: 60_000 }),
        input: optionalText(call.args, 'input', 1024 * 1024),
      })
    },
  },
  'clipboard.read': {
    permission: 'clipboard',
    run: (call) => call.context.clipboard.read(),
  },
  'clipboard.write': {
    permission: 'clipboard',
    run: (call) => call.context.clipboard.write(anyText(call.args, 'text', 1024 * 1024)),
  },
}

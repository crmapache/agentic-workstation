import { text, handlerOf } from './host-args'
import type { HostMethod } from './host-types'

/** Ручки без прав: своё хранилище, свои настройки, список открытых проектов. */
export const STATE_METHODS: Record<string, HostMethod> = {
  'storage.get': {
    permission: null,
    run: (call) => call.context.storage.get(call.runtime.id, text(call.args, 'key', 200)),
  },
  'storage.set': {
    permission: null,
    run: (call) =>
      call.context.storage.set(
        call.runtime.id,
        text(call.args, 'key', 200),
        call.args['value'] ?? null,
      ),
  },
  'storage.delete': {
    permission: null,
    run: (call) => call.context.storage.delete(call.runtime.id, text(call.args, 'key', 200)),
  },
  'storage.keys': {
    permission: null,
    run: (call) => call.context.storage.keys(call.runtime.id),
  },
  'settings.get': {
    permission: null,
    run: (call) => call.context.setting(call.runtime, text(call.args, 'key', 40)),
  },
  'settings.all': {
    permission: null,
    run: (call) =>
      Object.fromEntries(
        call.runtime.manifest.settings.map((field) => [
          field.key,
          call.context.setting(call.runtime, field.key),
        ]),
      ),
  },
  'settings.watch': {
    permission: null,
    run: (call) => {
      call.runtime.hooks.set(handlerOf(call.args), 'settings')
    },
  },
  'projects.list': {
    permission: null,
    run: (call) => call.context.projects(),
  },
  'projects.active': {
    permission: null,
    run: (call) => call.context.projects().find((project) => project.active) ?? null,
  },
}

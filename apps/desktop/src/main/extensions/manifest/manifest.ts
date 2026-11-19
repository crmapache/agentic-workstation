import { z } from 'zod'

import type { ExtensionManifest } from '@shared/extensions'
import { EXTENSION_PERMISSIONS } from '@shared/extensions'

/** Файл манифеста в папке расширения. */
export const MANIFEST_FILE = 'extension.json'

/** id расширения - имя его папки: латиница, цифры, дефис, с буквы. */
export const EXTENSION_ID = /^[a-z][a-z0-9-]{1,39}$/

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** Адрес сети: имя хоста или «*.домен» - все поддомены, без самого домена. */
const HOST =
  /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/** Программа для shell: имя из PATH, без путей и знаков оболочки. */
const COMMAND = /^[A-Za-z0-9._+-]{1,64}$/

const SETTING_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/

const text = (max: number) => z.string().trim().min(1).max(max)

const settingBase = {
  key: z.string().regex(SETTING_KEY),
  label: text(80),
  description: text(300).optional(),
}

const settingSchema = z.discriminatedUnion('type', [
  z.object({
    ...settingBase,
    type: z.enum(['text', 'secret']),
    placeholder: text(120).optional(),
    default: z.string().max(2000).optional(),
  }),
  z.object({ ...settingBase, type: z.literal('switch'), default: z.boolean().optional() }),
  z.object({
    ...settingBase,
    type: z.literal('select'),
    options: z
      .array(z.object({ value: text(80), label: text(80) }))
      .min(1)
      .max(50),
    default: z.string().max(80).optional(),
  }),
])

const manifestSchema = z.object({
  id: z.string().regex(EXTENSION_ID),
  name: text(60),
  version: z.string().regex(VERSION),
  description: z.string().trim().max(500).default(''),
  icon: z
    .string()
    .regex(/^[A-Z][A-Za-z0-9]{0,40}$/)
    .default('Puzzle'),
  main: z
    .string()
    .regex(/^[A-Za-z0-9._/-]+\.m?js$/)
    .refine((path) => !path.split('/').some((part) => part === '..' || part === '' || part === '.'))
    .default('main.js'),
  apiVersion: z.literal(1),
  permissions: z.array(z.enum(EXTENSION_PERMISSIONS)).max(EXTENSION_PERMISSIONS.length).default([]),
  network: z.object({ hosts: z.array(z.string().toLowerCase().regex(HOST)).max(50) }).optional(),
  shell: z.object({ commands: z.array(z.string().regex(COMMAND)).max(50) }).optional(),
  settings: z.array(settingSchema).max(40).default([]),
})

export type ManifestResult =
  { ok: true; manifest: ExtensionManifest } | { ok: false; detail: string }

/**
 * Разобрать манифест. Папка - id: манифест с чужим id не грузится (так id в правах и данных
 * совпадает с папкой). Рамки сети и программ без своего права - ошибка: иначе человек одобрил
 * бы непонятно что.
 */
export const parseManifest = (raw: string, folder: string): ManifestResult => {
  let json: unknown

  try {
    json = JSON.parse(raw)
  } catch (error) {
    return { ok: false, detail: `extension.json is not valid JSON: ${(error as Error).message}` }
  }

  const parsed = manifestSchema.safeParse(json)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]

    return {
      ok: false,
      detail: `extension.json: ${issue?.path.join('.') || 'root'} - ${issue?.message ?? 'invalid'}`,
    }
  }

  const value = parsed.data

  if (value.id !== folder) {
    return {
      ok: false,
      detail: `extension.json: id "${value.id}" must match the folder "${folder}".`,
    }
  }

  const hosts = [...new Set(value.network?.hosts ?? [])]
  const commands = [...new Set(value.shell?.commands ?? [])]
  const permissions = [...new Set(value.permissions)]

  if (hosts.length > 0 && !permissions.includes('network')) {
    return { ok: false, detail: 'extension.json: network.hosts needs the "network" permission.' }
  }

  if (commands.length > 0 && !permissions.includes('shell')) {
    return { ok: false, detail: 'extension.json: shell.commands needs the "shell" permission.' }
  }

  const keys = new Set<string>()

  for (const setting of value.settings) {
    if (keys.has(setting.key)) {
      return { ok: false, detail: `extension.json: setting "${setting.key}" is declared twice.` }
    }

    keys.add(setting.key)
  }

  return {
    ok: true,
    manifest: {
      id: value.id,
      name: value.name,
      version: value.version,
      description: value.description,
      icon: value.icon,
      main: value.main,
      apiVersion: 1,
      requests: { permissions, hosts, commands },
      settings: value.settings,
    },
  }
}

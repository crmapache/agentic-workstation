import { randomBytes } from 'node:crypto'
import { cp, rm, link, stat, lstat, mkdir, readdir, symlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { IS_WINDOWS } from '../../platform'
import type { Environment } from '../../process/shell-env'
import type { JsonFile } from '../../storage/json-file'

/** Аккаунт Codex панели: id ('' - обычный вход в `~/.codex`), имя от человека, кто вошёл. */
export type StoredCodexAccount = { id: string; alias: string; email: string; plan: string }

export type StoredCodexAccounts = { current: string; accounts: StoredCodexAccount[] }

/** Файл входа: у каждого аккаунта свой, всё остальное `~/.codex` - общее. */
const AUTH_FILE = 'auth.json'

/** Переменные, которые перебили бы вход аккаунта ключом из окружения: пустые, а не удалённые. */
const AUTH_ENV = ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN'] as const

/** Файлы с ключами (входы MCP и прочее): копией в папку аккаунта они не уходят никогда. */
const SECRET_FILE = /auth|credential|token|secret|key/i

const DEFAULT: StoredCodexAccount = { id: '', alias: '', email: '', plan: '' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

const parseAccounts = (value: unknown): StoredCodexAccounts => {
  const record = isRecord(value) ? value : {}
  const rows = (Array.isArray(record['accounts']) ? record['accounts'] : [])
    .filter(isRecord)
    .map((row) => ({
      id: text(row, 'id'),
      alias: text(row, 'alias'),
      email: text(row, 'email'),
      plan: text(row, 'plan'),
    }))
    .filter((row) => row.id === '' || /^[0-9a-f]{16}$/.test(row.id))
  const accounts = rows.some((row) => row.id === '') ? rows : [DEFAULT, ...rows]
  const current = text(record, 'current')

  return { current: accounts.some((row) => row.id === current) ? current : '', accounts }
}

/**
 * Аккаунты Codex (docs/plan-providers/30-codex.md, как в amazing-codex): обычный вход - сам
 * `~/.codex` человека; у добавленного - своя папка CODEX_HOME со своим `auth.json`, а всё
 * остальное из `~/.codex` (настройки, навыки, журналы разговоров) в ней - ссылками: история и
 * настройки у всех аккаунтов общие. Конфиг человека не правится.
 */
export class CodexAccounts {
  private constructor(
    private state: StoredCodexAccounts,
    private readonly file: JsonFile<StoredCodexAccounts>,
    /** Где лежат папки добавленных аккаунтов. */
    private readonly root: string,
  ) {}

  static async load(file: JsonFile<StoredCodexAccounts>, root: string): Promise<CodexAccounts> {
    return new CodexAccounts(parseAccounts(await file.read()), file, root)
  }

  get current(): string {
    return this.state.current
  }

  get list(): readonly StoredCodexAccount[] {
    return this.state.accounts
  }

  find(id: string): StoredCodexAccount | undefined {
    return this.state.accounts.find((account) => account.id === id)
  }

  /**
   * Окружение Codex для аккаунта: у обычного входа - как есть; у добавленного - его CODEX_HOME
   * (ссылки на общее - заново: человек мог завести в `~/.codex` новое), база состояния - общая,
   * ключи из окружения пустые, чтобы не перебили вход. Общая папка - та, что видит сам Codex
   * в окружении запуска (CODEX_HOME из профиля оболочки), а не главный процесс IDE.
   */
  async envFor(id: string, base: Environment): Promise<Environment> {
    if (id === '') return base

    const shared = base['CODEX_HOME'] || join(homedir(), '.codex')
    const home = join(this.root, id)

    await linkShared(shared, home)

    return {
      ...base,
      CODEX_HOME: home,
      CODEX_SQLITE_HOME: base['CODEX_SQLITE_HOME'] || shared,
      ...Object.fromEntries(AUTH_ENV.map((name) => [name, ''])),
    }
  }

  /** Новый аккаунт: папка и id; в список он встанет, когда вход состоится (remember). */
  async create(): Promise<string> {
    const id = randomBytes(8).toString('hex')

    await mkdir(join(this.root, id), { recursive: true })

    return id
  }

  /** Кто вошёл в аккаунт - в список (новый встаёт в конец). */
  remember(id: string, facts: { email: string; plan: string }): void {
    const known = this.find(id)

    this.state.accounts = known
      ? this.state.accounts.map((row) => (row.id === id ? { ...row, ...facts } : row))
      : [...this.state.accounts, { id, alias: '', ...facts }]
    this.save()
  }

  select(id: string): void {
    if (!this.find(id)) return

    this.state.current = id
    this.save()
  }

  rename(id: string, alias: string): void {
    this.state.accounts = this.state.accounts.map((row) =>
      row.id === id ? { ...row, alias } : row,
    )
    this.save()
  }

  /** Забыть добавленный аккаунт: его папка со входом удаляется; на нём шли разговоры - на обычный. */
  async forget(id: string): Promise<void> {
    if (id === '') return

    this.state.accounts = this.state.accounts.filter((row) => row.id !== id)
    if (this.state.current === id) this.state.current = ''
    this.save()
    await rm(join(this.root, id), { recursive: true, force: true })
  }

  /** Недоделанный аккаунт (вход не состоялся) - без следа. */
  async discard(id: string): Promise<void> {
    if (!this.find(id)) await rm(join(this.root, id), { recursive: true, force: true })
  }

  private save(): void {
    void this.file.write(this.state).catch((error: unknown) => {
      console.warn('[codex] аккаунты не записались:', error)
    })
  }
}

/**
 * Файл из общей папки - в папку аккаунта: ссылкой; на Windows без режима разработчика
 * символьную ссылку на файл не дают - жёсткая (NTFS, прав администратора не надо); на другом
 * диске и она не выйдет - копия, но не файла с ключами.
 */
const linkFile = async (source: string, target: string, name: string): Promise<void> => {
  const linked = await symlink(source, target).then(
    () => true,
    () =>
      link(source, target).then(
        () => true,
        () => false,
      ),
  )

  if (!linked && !SECRET_FILE.test(name)) await cp(source, target).catch(() => undefined)
}

/**
 * Всё из общей папки Codex, кроме входа, - ссылками в папку аккаунта (на Windows папки -
 * junction). Жёсткая ссылка и копия отстают, когда Codex переписывает файл заменой: такие
 * ставятся заново на каждом запуске.
 */
const linkShared = async (shared: string, home: string): Promise<void> => {
  await mkdir(home, { recursive: true })

  for (const entry of await readdir(shared).catch(() => [])) {
    if (entry === AUTH_FILE) continue

    const source = join(shared, entry)
    const target = join(home, entry)
    const [from, to] = await Promise.all([
      stat(source).catch(() => null),
      lstat(target).catch(() => null),
    ])

    if (!from || to?.isSymbolicLink() || to?.isDirectory()) continue
    // Тот же файл (жёсткая ссылка) - на месте; иначе это старая копия: заново.
    if (to && to.ino === from.ino && to.dev === from.dev) continue
    if (to) await rm(target, { force: true })

    if (from.isDirectory()) {
      await symlink(source, target, IS_WINDOWS ? 'junction' : undefined).catch(() => undefined)
    } else {
      await linkFile(source, target, entry)
    }
  }
}

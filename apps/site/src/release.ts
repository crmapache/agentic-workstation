/**
 * Номер последней версии и размеры установщиков - в момент открытия страницы.
 *
 * Ссылки на скачивание в разметке постоянные (`/releases/latest/download/<имя>`), поэтому
 * страницу не надо пересобирать к каждому выпуску. Номер же версии, вписанный в разметку,
 * устарел бы с первым /build - его отдаёт свой сервер: /release.json - это ответ API GitHub о
 * последнем выпуске, который nginx держит в кеше (nginx.conf; в dev и preview - прокси Vite).
 * Напрямую из браузера к API не ходим: лимит там на адрес посетителя, 60 запросов в час.
 * Не ответил - подписи просто не появляются, ссылки работают и без них.
 */

const LATEST_RELEASE_URL = '/release.json'

/** Имена файлов задаёт electron-builder.yml (artifactName), сайт на них ссылается как есть. */
const ASSETS = {
  mac: 'agentic-workstation-mac-arm64.dmg',
  windows: 'agentic-workstation-win-x64.exe',
} as const

/** Ответ GitHub по сессии вкладки: обновление страницы не тратит лимит API (60 в час на адрес). */
const CACHE_KEY = 'aw-latest-release'

interface Release {
  version: string
  publishedAt: string
  sizes: Record<keyof typeof ASSETS, number | undefined>
}

interface GithubRelease {
  tag_name: string
  published_at: string
  assets: Array<{ name: string; size: number }>
}

const readCache = (): Release | null => {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    return cached ? (JSON.parse(cached) as Release) : null
  } catch {
    return null
  }
}

const fetchRelease = async (): Promise<Release | null> => {
  const cached = readCache()
  if (cached) return cached

  const response = await fetch(LATEST_RELEASE_URL)
  if (!response.ok) return null

  const data = (await response.json()) as GithubRelease
  const sizeOf = (name: string) => data.assets.find((asset) => asset.name === name)?.size
  const release: Release = {
    version: data.tag_name.replace(/^v/, ''),
    publishedAt: data.published_at,
    sizes: { mac: sizeOf(ASSETS.mac), windows: sizeOf(ASSETS.windows) },
  }

  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(release))
  } catch {
    // Приватный режим Safari не даёт писать в хранилище - просто спросим в следующий раз.
  }
  return release
}

/** Мегабайты по-десятичному, как их показывает Finder и проводник Windows. */
const formatSize = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

const reveal = (element: HTMLElement, text: string) => {
  element.textContent = text
  element.hidden = false
}

export const showLatestRelease = async () => {
  let release: Release | null = null
  try {
    release = await fetchRelease()
  } catch {
    // Сеть или лимит API: страница остаётся без номера версии.
  }
  if (!release) return

  for (const element of document.querySelectorAll<HTMLElement>('[data-release-version]')) {
    reveal(element, `Version ${release.version}, released ${formatDate(release.publishedAt)}`)
  }

  for (const element of document.querySelectorAll<HTMLElement>('[data-release-size]')) {
    const platform = element.dataset.releaseSize as keyof typeof ASSETS
    const size = release.sizes[platform]
    if (size) reveal(element, formatSize(size))
  }
}

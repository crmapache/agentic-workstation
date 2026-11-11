/**
 * Путь от корня проекта: имя файла отдельно, папка над ним отдельно, без слеша на
 * конце. Файл в корне - папка пустая. Нужно поиску, панели Claude Code и редактору.
 */
export const splitPath = (path: string): { folder: string; name: string } => {
  const slash = path.lastIndexOf('/')

  return { folder: slash < 0 ? '' : path.slice(0, slash), name: path.slice(slash + 1) }
}

/**
 * Последняя часть пути - имя папки или файла, как его зовут люди: проект по корню, файл в
 * чипе. Слеш на конце не мешает; путь без частей («/») - как есть.
 */
export const baseName = (path: string): string => path.split('/').filter(Boolean).at(-1) ?? path

/**
 * Путь вне проекта: ключ его вкладки - абсолютный путь, а путь от корня проекта никогда не
 * начинается с «/» (дерево, поиск, git). Файл вне проекта открывают ссылкой из ленты.
 */
export const isOutsidePath = (path: string): boolean => path.startsWith('/')

/** Путь для показа: домашняя папка - через ~, как в WebStorm и терминале. */
export const displayPath = (path: string, homeDir: string | undefined): string =>
  homeDir && (path === homeDir || path.startsWith(`${homeDir}/`))
    ? `~${path.slice(homeDir.length)}`
    : path

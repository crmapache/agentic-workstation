import { splitPath } from '../../lib/path.utils'

/** Папка, в которой лежит путь: рядом с активным проектом кладут клон. Путь Windows - по своей черте. */
export const parentFolder = (path: string): string => splitPath(path).folder || '/'

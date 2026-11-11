/** Папка, в которой лежит путь: рядом с активным проектом кладут клон. */
export const parentFolder = (path: string): string => path.slice(0, path.lastIndexOf('/')) || '/'

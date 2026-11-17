import type { CommandArgs } from '@agentic-workstation/remote-protocol/commands'

export type PhoneFile = NonNullable<CommandArgs<'conversation.send'>['files']>[number]

/** Записать файл к себе: путь на диске IDE или null (пустой, тяжелее потолка, не записался). */
export type SaveFile = (name: string, data: string) => Promise<string | null>

/**
 * Файлы с телефона (не картинки) - в каталог вставок IDE и в текст ссылками «@путь» после слов,
 * как документ, вставленный в поле IDE (`tokenText` окна): пути на телефоне у файла нет, модель
 * читает его с диска машины. Хоть один не записался - null: сообщение без обещанного файла модель
 * поняла бы не так, а телефон получает отказ вместо тихой потери.
 */
export const withFiles = async (
  text: string,
  files: readonly PhoneFile[],
  save: SaveFile,
): Promise<string | null> => {
  if (files.length === 0) return text

  const paths = await Promise.all(files.map((file) => save(file.name, file.data)))

  if (paths.some((path) => path === null)) return null

  const references = paths.map((path) => `@${path ?? ''}`).join(' ')

  return text ? `${text} ${references}` : references
}

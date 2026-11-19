import type { DraftChip, AttachmentPath } from '@shared/message-draft'

import { PROJECT_PATHS_MIME } from '../../lib/project-drag'
import { kindOfPath } from './message-replay.utils'

/** Чип по описанию пути из главного процесса: файл, картинка (файлом) или папка. */
export const chipOfPath = ({ path, kind }: AttachmentPath): DraftChip => ({ kind, value: path })

/** Чип пути из дерева: папка кончается «/», картинка - по расширению (как «@» и реплей). */
export const chipOfProjectPath = (path: string): DraftChip => ({
  kind: kindOfPath(path),
  value: path,
})

/** Тащат файлы (Finder или дерево IDE), а не кусок текста. */
export const carriesFiles = (transfer: DataTransfer | null): boolean =>
  Array.from(transfer?.types ?? []).some((type) => type === 'Files' || type === PROJECT_PATHS_MIME)

/** Байты файла - base64 для записи в каталог IDE. */
export const base64Of = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''

  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  }

  return btoa(binary)
}

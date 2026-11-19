import { useExtensionDialogs } from '../../../state/extension-dialogs.store'
import { AskedDialog } from './parts/AskedDialog'

/**
 * Вопрос расширения человеку (ADR 0091): prompt, confirm или pick окном поверх IDE, по одному.
 * Ответ уходит главному процессу, там его ждёт вызов расширения; закрыл - «без ответа».
 */
export const ExtensionDialog = () => {
  const request = useExtensionDialogs((store) => store.queue[0] ?? null)

  return request ? <AskedDialog key={request.requestId} request={request} /> : null
}

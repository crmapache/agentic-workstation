import type { MenuScreen } from '../panel.types'
import type { NewChatField } from '../NewChatScreen/NewChatScreen.types'

/** Какой список показывает экран: один вид на три экрана, различие - в полях. */
export const FIELD_OF_SCREEN: Partial<Record<MenuScreen, NewChatField>> = {
  newChatModel: 'model',
  newChatEffort: 'effort',
  newChatMode: 'mode',
}

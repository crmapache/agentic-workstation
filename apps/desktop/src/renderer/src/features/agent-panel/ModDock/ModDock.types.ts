import type { ConversationMods } from '@shared/panel-extras'

export type ModDockProps = {
  /** Что моды держат на экране; нет - карточки нет. */
  mods: ConversationMods | undefined
}

import type { ClaudeConfigSetting } from '@shared/claude-config'

/** Ряд настройки: подпись и пояснение уже словами, правка - через onSet. */
export type ConfigRowProps = {
  setting: ClaudeConfigSetting
  label: string
  /** Пояснение под подписью: «сохраняю», блокировка, «не задано», «только здесь». */
  note: string | undefined
  /** Ряд не трогается: идёт правка (одна за раз) или настройку держит слой сильнее. */
  disabled: boolean
  /** Слова CLI об отказе под рядом; пусто - отказа не было. */
  failure: string | undefined
  onSet: (key: string, value: string) => void
}

export type ConfigValueProps = {
  value: string
  label: string
  disabled: boolean
  onSave: (value: string) => void
}

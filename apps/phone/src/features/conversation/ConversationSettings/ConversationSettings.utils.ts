import type {
  FastWire,
  ProviderCaps,
  ConversationWire,
} from '@agentic-workstation/remote-protocol/wire-types'

/**
 * Быстрый режим предлагается у модели, которая его умеет (каталог провайдера), - выбранной или
 * той, что назвал провайдер. Уже попросили - переключатель виден всегда: выключить его надо
 * уметь и у модели, о которой каталог молчит. Провайдер без быстрого режима (fastMode false) -
 * не предлагается вовсе; IDE постарше флага не шлёт - решает каталог.
 */
export const fastOffered = (conversation: ConversationWire, provider: ProviderCaps): boolean => {
  if (provider.fastMode === false) return false
  if (conversation.fast?.asked) return true

  const models = [conversation.model, conversation.activeModel].filter(Boolean)

  return provider.models.some((model) => model.fast === true && models.includes(model.value))
}

/**
 * Что сказать под переключателем: что CLI сказал о режиме в последний раз; попросили, а он ещё
 * молчит, - включится со следующим сообщением. null - сказать нечего.
 */
export const fastStateKey = (fast: FastWire | undefined): string | null => {
  if (fast?.state) return `conversation.fast.states.${fast.state}`
  if (fast?.asked) return 'conversation.fast.states.waiting'

  return null
}

/**
 * Режим разрешений меняется с телефона у IDE, которая говорит, что гасит этой вкладке
 * (unavailableModes, ADR 0076): та же версия принимает и conversation.setMode. Старая IDE поля
 * не шлёт и команду отказала бы целиком - раздела у неё нет.
 */
export const modesOffered = (conversation: ConversationWire): boolean =>
  conversation.unavailableModes !== undefined

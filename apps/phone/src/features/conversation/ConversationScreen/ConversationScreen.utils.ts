import type {
  ProviderCaps,
  ConversationWire,
} from '@agentic-workstation/remote-protocol/wire-types'

/** Модель разговора словами каталога провайдера; не выбрана - та, что назвал провайдер. */
export const modelLabelOf = (
  conversation: ConversationWire,
  provider: ProviderCaps | undefined,
): string => {
  const chosen = provider?.models.find((model) => model.value === conversation.model)

  return chosen?.label ?? conversation.model ?? conversation.activeModel ?? ''
}

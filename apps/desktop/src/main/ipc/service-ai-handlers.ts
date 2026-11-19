import type { ServiceAiInvokeContract } from '@shared/ipc/service-ai.contract'

import type { ServiceAiService } from '../service-ai/service-ai-service'
import type { InvokeHandlers } from './handle'

type ServiceAiChannels = keyof ServiceAiInvokeContract

/** Каналы провайдера служебной работы (Settings → AI): настройку разбирает сервис. */
export const createServiceAiHandlers = (
  serviceAi: ServiceAiService,
): Pick<InvokeHandlers, ServiceAiChannels> => ({
  'serviceAi:get': () => serviceAi.value,
  'serviceAi:set': ({ value }) => serviceAi.set(value),
})

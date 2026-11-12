import { useTranslation } from 'react-i18next'

import { Banner } from '../Banner/Banner'
import { useLinkStatus } from '../../state/remote.queries'

/**
 * Связь с IDE экрана - полосой: IDE не отвечает (то, что на экране, - последнее известное, оно
 * могло устареть) или отпустила телефон. На связи и пока звоним - ничего: полоса, мигающая на
 * каждом старте страницы, приучила бы её не читать.
 */
export const LinkBanner = ({ agentId }: { agentId: string }) => {
  const { t } = useTranslation()
  const status = useLinkStatus(agentId)

  if (status === 'offline') return <Banner tone="warning" text={t('link.banner.offline')} />
  if (status === 'revoked') return <Banner tone="danger" text={t('link.banner.revoked')} />

  return null
}

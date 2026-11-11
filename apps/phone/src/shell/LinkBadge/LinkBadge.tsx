import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'

import type { LinkStatus } from '../../remote/machine-session'
import { LINK_TONES } from './LinkBadge.constants'

/** Связь с IDE словом и точкой тона: на связи, звоним, не отвечает, отпустила. */
export const LinkBadge = ({ status }: { status: LinkStatus }) => {
  const { t } = useTranslation()

  return <Badge tone={LINK_TONES[status]}>{t(`link.${status}`)}</Badge>
}

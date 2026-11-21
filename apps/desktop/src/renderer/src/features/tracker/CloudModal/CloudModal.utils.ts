import type { LucideIcon } from 'lucide-react'
import { Cloud, CloudOff, CloudAlert, CloudCheck, CloudUpload } from 'lucide-react'

import type { CloudStatus } from '@shared/tracker'

/** Значок облака по состоянию: синхронно - галочка, в пути - стрелка, нет связи - зачёркнуто. */
export const cloudIcon = (status: CloudStatus): LucideIcon =>
  status === 'synced'
    ? CloudCheck
    : status === 'syncing'
      ? CloudUpload
      : status === 'error'
        ? CloudAlert
        : status === 'offline' || status === 'off'
          ? CloudOff
          : Cloud

import { useEffect, useEffectEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { ACTIVITY_BAR_IDS } from '@shared/window'
import type { BarMenuEntry, ActivityBarId } from '@shared/window'

import type { BarAction } from '../ActivityBar/ActivityBar.types'
import { viewsOfGroup } from '../views/view-group'
import { viewLabel } from '../views/view-label'
import type { ViewDescriptor } from '../views/views.types'
import { invoke } from '../../lib/ipc'
import { useIpcEvent } from '../../lib/ipc.hooks'
import { DEFAULT_BAR_ARRANGEMENT } from '../../state/bar-buttons.constants'
import { useBarButtonsStore } from '../../state/bar-buttons.store'
import { menuGroups } from '../../state/bar-buttons.utils'

/** Кнопки одной полосы, как их получает ActivityBar: виды (со своей группой) и действия низа. */
type BarContents = { views: readonly ViewDescriptor<string>[]; footer: readonly BarAction[] }

/**
 * Меню View - зеркало кнопок полос (ADR 0112): на каждое изменение (спрятали, переставили,
 * расширение принесло свой вид) окно шлёт главному процессу кнопки всех полос с галочками, а
 * нажатую там галочку и «вернуть как было» получает событием и кладёт в тот же стор.
 */
export const useBarMenu = (bars: Record<ActivityBarId, BarContents>) => {
  const { t } = useTranslation()
  const arrangements = useBarButtonsStore((state) => state.bars)
  const setShown = useBarButtonsStore((state) => state.setShown)
  const reset = useBarButtonsStore((state) => state.reset)
  const entries: BarMenuEntry[] = ACTIVITY_BAR_IDS.map((bar) => {
    const { views, footer } = bars[bar]
    const named = (view: ViewDescriptor<string>) => ({ id: view.id, name: viewLabel(view, t) })
    const groups = {
      top: viewsOfGroup(views, 'top').map(named),
      bottom: [
        ...viewsOfGroup(views, 'bottom').map(named),
        ...footer.map(({ id, name }) => ({ id, name })),
      ],
    }

    return {
      bar,
      groups: menuGroups(groups, arrangements[bar] ?? DEFAULT_BAR_ARRANGEMENT).map((list) =>
        list.map(({ button, shown }) => ({ id: button.id, label: button.name, shown })),
      ),
    }
  })
  // Пересобирать меню главному процессу - только когда в нём правда что-то поменялось.
  const signature = JSON.stringify(entries)

  const send = useEffectEvent(() => void invoke('window:setBarMenu', { bars: entries }))

  useEffect(() => send(), [signature])

  useIpcEvent('window:barMenu', (command) =>
    command.kind === 'reset'
      ? reset(command.bar)
      : setShown(command.bar, command.id, command.shown),
  )
}

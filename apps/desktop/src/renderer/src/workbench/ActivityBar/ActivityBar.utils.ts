import type { TFunction } from 'i18next'

import { viewLabel } from '../views/view-label'
import type { BarButtonGroups, ActivityBarProps } from './ActivityBar.types'

/**
 * Кнопки полосы одной формой: виды сверху - с числом того, что ждёт человека, или, когда его нет,
 * точкой и светом зова; действия низа - как есть. Горит показанный вид, а показанный не светит
 * зовом: свет тогда на его собственных вкладках.
 */
export const barButtons = <ViewId extends string>(
  {
    views,
    activeViewId,
    isPanelOpen,
    footer,
    badges,
    marks,
    calls,
    onSelect,
  }: ActivityBarProps<ViewId>,
  t: TFunction,
): BarButtonGroups => ({
  top: views.map((view) => {
    const name = viewLabel(view, t)
    const count: number = badges?.[view.id] ?? 0
    const mark = count > 0 ? undefined : marks?.[view.id]
    const isShown = isPanelOpen && view.id === activeViewId
    const call = isShown ? undefined : calls?.[view.id]

    return {
      id: view.id,
      icon: view.icon,
      name,
      label:
        count > 0
          ? t('activityBar.waiting', { label: name, count })
          : (call?.label ?? mark?.label ?? name),
      active: isShown,
      count,
      mark,
      // Свет стоит в кнопке всегда, когда полоса его знает: гаснет плавно, а не пропадает.
      call: calls ? (call?.tone ?? null) : undefined,
      callSince: call?.at,
      onClick: () => onSelect(view.id),
    }
  }),
  bottom: (footer ?? []).map((action) => ({
    id: action.id,
    icon: action.icon,
    name: action.name,
    label: action.hint ?? action.name,
    active: action.active,
    count: 0,
    onClick: action.onClick,
  })),
})

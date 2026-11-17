import type { GitChange } from '@shared/git'

import type {
  ChangeGroupId,
  MeasuredGroup,
  GroupExpansion,
  ChangeGroupData,
} from './ChangesView.types'

/**
 * Список изменений по группам: сначала то, что git знает, потом новые файлы. Порядок
 * внутри группы - порядок git (по пути); пустых групп нет.
 */
export const groupChanges = (files: readonly GitChange[]): ChangeGroupData[] => {
  const groups: ChangeGroupData[] = [
    { id: 'tracked', files: files.filter((change) => change.kind !== 'untracked') },
    { id: 'untracked', files: files.filter((change) => change.kind === 'untracked') },
  ]

  return groups.filter((group) => group.files.length > 0)
}

/** Метка группы в разметке: по ней замер списка узнаёт, чья это высота. */
export const groupMark = (id: ChangeGroupId) => ({ 'data-change-group': id })

/**
 * Раскрытие групп после замера списка. Решённые остаются как были; новые раскрываются по
 * порядку, пока их строки помещаются без прокрутки (free - сколько места останется при всех
 * свёрнутых). Не влезла большая - следующая, поменьше, ещё может встать. Групп, которых в
 * замере нет, в ответе тоже нет.
 */
export const fitExpansion = (
  free: number,
  groups: readonly MeasuredGroup[],
  decided: GroupExpansion,
): GroupExpansion => {
  const expansion: GroupExpansion = {}
  let left = free

  for (const { id, rowsHeight } of groups) if (decided[id]) left -= rowsHeight

  for (const { id, rowsHeight } of groups) {
    const known = decided[id]
    const fits = rowsHeight <= left

    if (known === undefined && fits) left -= rowsHeight

    expansion[id] = known ?? fits
  }

  return expansion
}

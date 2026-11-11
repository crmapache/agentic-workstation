import { useState } from 'react'
import { Tag, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'
import { TextField } from '@agentic-workstation/ui/TextField'

import { GIT_BRANCH_ACTIONS, GIT_REPOSITORY_ACTIONS } from '../git-actions.constants'
import type { GitActionEntry } from '../git-actions.types'
import { isAvailableAction } from '../git-actions.utils'
import { useGitBranches } from '../git.queries'
import type { BranchMenuProps } from './BranchMenu.types'
import { filterByQuery } from './BranchMenu.utils'

/**
 * Меню ветки, как в WebStorm: поиск по веткам и действиям, действия с репозиторием,
 * создание ветки, переход на тег или коммит, локальные и удалённые ветки. Commit
 * пока недоступен - для него нужен свой инструмент.
 */
export const BranchMenu = ({ projectId, head, onSwitch, onAction }: BranchMenuProps) => {
  const { t } = useTranslation()
  const { data: branches } = useGitBranches(projectId)
  const [query, setQuery] = useState('')
  const label = (entry: GitActionEntry) => t(entry.labelKey)
  const repositoryActions = filterByQuery(GIT_REPOSITORY_ACTIONS, query, label)
  const branchActions = filterByQuery(GIT_BRANCH_ACTIONS, query, label)
  const local = filterByQuery(branches?.local ?? [], query, (branch) => branch)
  const remote = filterByQuery(branches?.remote ?? [], query, (branch) => branch)
  const isSearching = query.trim() !== ''
  const hasActions = repositoryActions.length + branchActions.length > 0
  const hasBranches = local.length + remote.length > 0
  const isEmpty = [repositoryActions, branchActions, local, remote].every(
    (list) => list.length === 0,
  )

  const renderAction = ({ id, icon, labelKey }: GitActionEntry) =>
    isAvailableAction(id) ? (
      <MenuItem key={id} icon={icon} label={t(labelKey)} onSelect={() => onAction(id)} />
    ) : (
      <MenuItem
        key={id}
        icon={icon}
        label={t(labelKey)}
        hint={t('common.notBuiltYet')}
        disabled
        onSelect={() => undefined}
      />
    )

  const handleLocalSelect = (branch: string, isCurrent: boolean) => {
    if (!isCurrent) onSwitch(branch, 'local')
  }

  return (
    <Menu
      label={t('git.menuLabel')}
      autoFocus
      header={
        <TextField
          label={t('git.search')}
          hideLabel
          icon={Search}
          placeholder={t('git.search')}
          value={query}
          data-autofocus
          onChange={setQuery}
        />
      }>
      {repositoryActions.map(renderAction)}
      {repositoryActions.length > 0 && branchActions.length > 0 && <MenuSeparator />}
      {branchActions.map(renderAction)}
      {hasActions && hasBranches && <MenuSeparator />}
      {local.length > 0 && (
        <MenuSection title={t('git.local')} collapsible forceExpanded={isSearching}>
          {local.map((branch) => {
            const isCurrent = head.kind === 'branch' && head.name === branch

            return (
              <MenuItem
                key={branch}
                icon={isCurrent ? Tag : undefined}
                label={branch}
                current={isCurrent}
                onSelect={() => handleLocalSelect(branch, isCurrent)}
              />
            )
          })}
        </MenuSection>
      )}
      {remote.length > 0 && (
        <MenuSection
          title={t('git.remote')}
          collapsible
          defaultCollapsed
          forceExpanded={isSearching}>
          {remote.map((branch) => (
            <MenuItem key={branch} label={branch} onSelect={() => onSwitch(branch, 'remote')} />
          ))}
        </MenuSection>
      )}
      {isEmpty && <MenuItem label={t('git.nothingFound')} disabled onSelect={() => undefined} />}
    </Menu>
  )
}

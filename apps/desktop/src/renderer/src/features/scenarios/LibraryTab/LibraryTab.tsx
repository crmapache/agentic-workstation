import { Library } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Scenario } from '@shared/scenarios'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import type { ShelfMove } from '../scenarios-shelves.utils'
import { ScenarioConfirm } from '../ScenarioConfirm/ScenarioConfirm'
import type { ScenariosTabProps } from '../ScenariosView/ScenariosView.types'
import { useScenarioQueues, useScenarioShelves } from '../../../state/scenarios.queries'
import { useLibraryActions } from './LibraryTab.hooks'
import { loadOf } from './LibraryTab.utils'
import { LibraryShelves } from './parts/LibraryShelves'

/**
 * Вкладка Library: две полки сценариев (Shelves в ACC) - проектная, что едет с репозиторием,
 * и личная, что идёт за человеком из проекта в проект. У строки - факты, идёт ли сценарий в
 * очередях проекта, его часы и действия; строки переставляются за ручку и между полками.
 */
export const LibraryTab = ({ project }: ScenariosTabProps) => {
  const { t } = useTranslation()
  const { data: view } = useScenarioShelves(project.id)
  const { data: queues } = useScenarioQueues()
  const library = useLibraryActions(project)

  if (!view) return <EmptyState icon={Library} title={t('scenarios.library.loading')} />

  const handleLoad = (scenario: Scenario) =>
    loadOf(queues?.queues ?? [], project.rootPath, scenario)

  const handlePlace = (move: ShelfMove) =>
    library.place(project.id, move.id, move.from, move.to, move.before)

  return (
    <>
      <LibraryShelves
        view={view}
        loadOf={handleLoad}
        actions={library.shelf}
        onPlace={handlePlace}
      />
      <ScenarioConfirm
        open={library.doomed !== null}
        title={t('scenarios.library.confirmDelete.title')}
        subject={library.doomed?.name ?? ''}
        note={t('scenarios.library.confirmDelete.note')}
        submit={t('scenarios.library.confirmDelete.submit')}
        onSubmit={library.confirmRemove}
        onClose={library.cancelRemove}
      />
    </>
  )
}

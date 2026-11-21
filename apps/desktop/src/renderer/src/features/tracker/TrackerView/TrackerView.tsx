import { useRef } from 'react'
import { Plus, Archive, SquareKanban } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { PageHeader } from '@agentic-workstation/ui/PageHeader'

import { useTrackerStore } from '../tracker.store'
import { Board } from '../Board/Board'
import { CloudButton } from '../CloudModal/CloudButton'
import { TrackerTabs } from '../TrackerTabs/TrackerTabs'
import { useTrackerBoard } from '../../../state/tracker.queries'
import { useActiveProject } from '../../../state/workspace.queries'
import styles from './TrackerView.module.scss'
import { TrackerModals } from './parts/TrackerModals'

/**
 * Трекер задач (ADR 0101) - вид середины окна: доска открытого проекта IDE. Проекты трекера -
 * вкладки в шапке, под ними потоки с группами колонками. У каждого проекта IDE своя доска; она
 * хранится шифром в облаке (ADR 0102), значок облака - в шапке.
 */
export const TrackerView = () => {
  const { t } = useTranslation()
  const project = useActiveProject()
  const { data: board } = useTrackerBoard(project)
  const stored = useTrackerStore((state) =>
    project ? state.activeByPath[project.rootPath] : undefined,
  )
  const setActive = useTrackerStore((state) => state.setActive)
  const edit = useTrackerStore((state) => state.edit)
  const open = useTrackerStore((state) => state.open)
  const scroller = useRef<HTMLDivElement | null>(null)
  const projects = board?.projects ?? []
  const active = projects.find((one) => one.id === stored) ?? projects[0] ?? null
  const archived = board?.archived.length ?? 0

  const handleActivate = (id: string) => {
    if (project) setActive(project.rootPath, id)
  }
  const newProject = (
    <Button icon={Plus} onClick={() => edit({ kind: 'project', id: null })}>
      {t('tracker.empty.create')}
    </Button>
  )

  return (
    <div className={styles.view}>
      <PageHeader
        icon={SquareKanban}
        title={t('tracker.title')}
        help={
          <HelpButton
            label={t('tracker.help.label')}
            title={t('tracker.help.title')}
            text={t('tracker.help.text')}
            closeLabel={t('common.close')}
          />
        }
        actions={
          project && (
            <div className={styles.actions}>
              {archived > 0 && (
                <IconButton
                  icon={Archive}
                  label={t('tracker.archive.title')}
                  onClick={() => open('archive')}
                />
              )}
              <CloudButton />
            </div>
          )
        }
        toolbar={
          project &&
          projects.length > 0 && (
            <TrackerTabs
              projects={projects}
              activeId={active?.id ?? null}
              onActivate={handleActivate}
            />
          )
        }
      />
      <div ref={scroller} className={styles.scroller}>
        <div className={styles.page}>
          {!project ? (
            <EmptyState icon={SquareKanban} title={t('tracker.empty.noProject')} />
          ) : !active ? (
            board && (
              <EmptyState
                icon={SquareKanban}
                title={t('tracker.empty.title')}
                description={t('tracker.empty.note')}
                action={newProject}
              />
            )
          ) : (
            <Board project={active} scroller={scroller} />
          )}
        </div>
      </div>
      {board && <TrackerModals board={board} onCreatedProject={handleActivate} />}
    </div>
  )
}

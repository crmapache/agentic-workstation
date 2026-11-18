import { BranchSwitcher } from '../../features/git/BranchSwitcher/BranchSwitcher'
import { ProjectSwitcher } from '../../features/projects/ProjectSwitcher/ProjectSwitcher'
import { MuteSoundsButton } from '../../features/settings/MuteSoundsButton/MuteSoundsButton'
import { useTitleBarHeightReport } from './TitleBar.hooks'
import styles from './TitleBar.module.scss'

/**
 * Шапка окна, как в WebStorm: слева проект и ветка, справа - одна кнопка «все звуки IDE»
 * (её жмут на ходу, перед звонком); поиск везде открывается двойным Shift и сочетаниями,
 * настройки - ⌘, из меню программы, витрина дизайн-системы (в dev) - действием поиска.
 * Окно таскают за пустые места - место под кнопки окна и распорку до них; кнопки шапки в
 * область перетаскивания не попадают. Кнопки окна рисует система: на маке «светофор» слева,
 * на Windows - справа. Шапка растёт с размером текста, и кнопки окна встают по её высоте. В
 * узком окне первой ужимается ветка.
 */
export const TitleBar = () => {
  const ref = useTitleBarHeightReport()

  return (
    <header ref={ref} className={styles.titleBar}>
      <div className={styles.windowStart} />
      <div className={styles.start}>
        <div className={styles.project}>
          <ProjectSwitcher />
        </div>
        <div className={styles.branch}>
          <BranchSwitcher />
        </div>
      </div>
      <div className={styles.dragSpace} />
      <div className={styles.end}>
        <MuteSoundsButton />
      </div>
      <div className={styles.windowEnd} />
    </header>
  )
}

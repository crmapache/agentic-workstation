import styles from './ComponentsView.module.scss'
import { ActionsSection } from './parts/ActionsSection'
import { ChartsSection } from './parts/ChartsSection'
import { ChoicesSection } from './parts/ChoicesSection'
import { FieldsSection } from './parts/FieldsSection'
import { IndicatorsSection } from './parts/IndicatorsSection'
import { OverlaysSection } from './parts/OverlaysSection'
import { SettingsSection } from './parts/SettingsSection'
import { SurfacesSection } from './parts/SurfacesSection'

/**
 * Вкладка «Компоненты» витрины: каждый примитив packages/ui во всех вариантах и
 * состояниях, живой - на него можно навести, нажать, открыть.
 */
export const ComponentsView = () => (
  <div className={styles.componentsView}>
    <ActionsSection />
    <IndicatorsSection />
    <FieldsSection />
    <SurfacesSection />
    <ChoicesSection />
    <ChartsSection />
    <SettingsSection />
    <OverlaysSection />
  </div>
)

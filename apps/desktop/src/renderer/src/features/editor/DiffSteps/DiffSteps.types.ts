export type DiffStepsProps = {
  /** Есть ли куда идти: различий нет - стрелки погашены. */
  hasChanges: boolean
  onPrevious: () => void
  onNext: () => void
}

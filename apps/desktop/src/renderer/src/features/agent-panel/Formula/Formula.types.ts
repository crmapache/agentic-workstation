export type FormulaProps = {
  /** LaTeX без разделителей. */
  latex: string
  /** Формула отдельным блоком (`$$…$$`, `\[…\]`), а не внутри строки. */
  display: boolean
}

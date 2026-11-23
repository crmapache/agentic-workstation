import type { RefObject } from 'react'

import type { ChipRegistry } from '../field-chips'

export type FieldChipsProps = {
  registry: ChipRegistry
  fieldRef: RefObject<HTMLDivElement | null>
}

/** Номер новой вкладки проекта: наименьший свободный, как «Local (2)» в WebStorm. */
export const nextOrdinal = (taken: readonly number[]): number => {
  let ordinal = 1

  while (taken.includes(ordinal)) ordinal += 1

  return ordinal
}

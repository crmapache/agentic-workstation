export type SearchCapsuleProps = {
  /** Разговор ленты (id вкладки): капсула стоит только над своим. */
  conversationId: string
  /** Высота полки закреплённых над лентой: капсула встаёт под неё. */
  offset: number
}

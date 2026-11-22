// Ворклет микрофона - отдельным модулем сборки: его адрес даёт Vite окна и телефона.
declare module '*?worker&url' {
  const url: string
  export default url
}

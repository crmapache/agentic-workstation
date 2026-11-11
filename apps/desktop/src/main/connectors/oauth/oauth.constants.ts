/** Страница, которую браузер показывает после возврата. Интерфейс IDE английский - и она. */
const page = (title: string, text: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
  '<style>body{font:16px -apple-system,system-ui,sans-serif;background:#111;color:#ddd;' +
  'display:grid;place-items:center;height:100vh;margin:0}main{text-align:center}' +
  'h1{font-size:20px;font-weight:600;color:#fff}</style></head>' +
  `<body><main><h1>${title}</h1><p>${text}</p></main></body></html>`

export const CALLBACK_PAGE = {
  success: page('Signed in', 'You can close this tab and return to Agentic Workstation.'),
  failure: page('Sign-in failed', 'Return to Agentic Workstation and try again.'),
}

/** Адреса Google для входа «приложения на компьютере». */
export const GOOGLE_OAUTH = {
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
}

/** Токен считается истёкшим чуть раньше срока: запрос не должен уйти с умирающим. */
export const TOKEN_EXPIRY_MARGIN_MS = 60_000

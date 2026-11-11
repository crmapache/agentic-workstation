import '@agentic-workstation/ui/tokens.css'
import '@agentic-workstation/ui/base.css'
import './styles/global.scss'
import './i18n'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { bootClient } from './lib/client'
import { takePairingCode } from './lib/pairing-link'
import { usePairingStore } from './state/pairing.store'
import { App } from './app/App/App'

// Секрет пары - из адреса сразу, до всего остального: дальше он живёт только в памяти.
usePairingStore.getState().take(takePairingCode(window.location, window.history))

const client = await bootClient()
const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <StrictMode>
      <App client={client} />
    </StrictMode>,
  )
}

// Оболочка для работы без сети и установки на экран «Домой» - только у сборки.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js')
}

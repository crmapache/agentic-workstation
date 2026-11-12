import '@agentic-workstation/ui/tokens.css'
import '@agentic-workstation/ui/base.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { PLATFORM } from '../lib/platform'
import { installTextSize } from '../state/text-size.store'
import { App } from './App/App'

import './i18n'

const root = document.getElementById('root')

if (!root) throw new Error('Нет #root в index.html')

// До первой отрисовки: окно сразу встаёт выбранным размером текста, без скачка.
installTextSize()
// Платформа - атрибутом корня: стилям, которые отличаются на маке и Windows (ADR 0048).
document.documentElement.dataset['platform'] = PLATFORM

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

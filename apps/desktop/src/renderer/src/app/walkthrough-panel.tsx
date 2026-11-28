import '@agentic-workstation/ui/tokens.css'
import '@agentic-workstation/ui/base.css'
import './overlay.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { WalkthroughPanel } from '../features/walkthrough/WalkthroughPanel/WalkthroughPanel'

import './i18n'

const root = document.getElementById('root')

if (!root) throw new Error('Нет #root в walkthrough-panel.html')

/**
 * Вход страницы панели инструментов человека в показе Walkthrough (ADR 0135) - окно-панель у
 * правого края экрана. Размер текста - обычный: окно панели фиксированного размера под него.
 */
createRoot(root).render(
  <StrictMode>
    <WalkthroughPanel />
  </StrictMode>,
)

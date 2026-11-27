import '@agentic-workstation/ui/tokens.css'
import '@agentic-workstation/ui/base.css'
import './overlay.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { WalkthroughMarks } from '../features/walkthrough/WalkthroughMarks/WalkthroughMarks'

const root = document.getElementById('root')

if (!root) throw new Error('Нет #root в walkthrough.html')

/**
 * Вход страницы меток показа Walkthrough (ADR 0134) - прозрачное окно поверх дисплея, которое
 * рисует обводку, стрелку и затемнение. Текста нет - ни i18n, ни кэша запросов странице не нужно.
 */
createRoot(root).render(
  <StrictMode>
    <WalkthroughMarks />
  </StrictMode>,
)

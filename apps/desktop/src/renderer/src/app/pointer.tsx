import '@agentic-workstation/ui/tokens.css'
import '@agentic-workstation/ui/base.css'
import './overlay.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ComputerPointer } from '../features/computer/ComputerPointer/ComputerPointer'

const root = document.getElementById('root')

if (!root) throw new Error('Нет #root в pointer.html')

/**
 * Вход страницы стрелки ИИ Computer Use (ADR 0079) - окно поверх всех приложений, которое
 * главный процесс ведёт за рукой. Текста нет - ни i18n, ни кэша запросов странице не нужно.
 */
createRoot(root).render(
  <StrictMode>
    <ComputerPointer />
  </StrictMode>,
)

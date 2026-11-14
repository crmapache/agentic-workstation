import '@agentic-workstation/ui/tokens.css'
import '@agentic-workstation/ui/base.css'
import './capsule.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { QueryClientProvider } from '@tanstack/react-query'

import { Capsule } from '../features/computer/Capsule/Capsule'
import { queryClient } from './query-client'

import './i18n'

const root = document.getElementById('root')

if (!root) throw new Error('Нет #root в capsule.html')

/**
 * Вход страницы капсулы Computer Use (ADR 0057) - отдельное окно-панель поверх всех приложений.
 * Размер текста - обычный: окно капсулы фиксированного размера под него.
 */
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Capsule />
    </QueryClientProvider>
  </StrictMode>,
)

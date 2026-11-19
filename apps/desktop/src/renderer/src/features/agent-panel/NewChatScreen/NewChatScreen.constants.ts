import { Cpu, Brain, ShieldCheck } from 'lucide-react'

import type { NewChatRow } from './NewChatScreen.types'

/** Три строки - то, с чем рождается вкладка: модель, усилие, режим. */
export const NEW_CHAT_ROWS: readonly NewChatRow[] = [
  { field: 'model', screen: 'newChatModel', icon: Cpu },
  { field: 'effort', screen: 'newChatEffort', icon: Brain },
  { field: 'mode', screen: 'newChatMode', icon: ShieldCheck },
]

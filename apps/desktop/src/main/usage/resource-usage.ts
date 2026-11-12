import { app } from 'electron'

import type { ResourceUsage } from '@shared/app-info'

import { IS_WINDOWS } from '../platform'
import { loadFootprintReader } from './phys-footprint'

/**
 * Процессор и память всех процессов IDE: главного, окна, GPU и служебных.
 *
 * Процессор - из Electron. Это среднее с прошлого вызова getAppMetrics, и интервал у
 * всех вызовов общий, поэтому getAppMetrics зовёт только этот замер. Память - из
 * macOS: workingSetSize у Electron - это RSS, где общие страницы фреймворка посчитаны
 * в каждом процессе заново, и сумма выходит в три-четыре раза больше «Мониторинга
 * системы» (docs/adr/0008-resource-usage.md). На Windows - privateBytes того же Electron:
 * частная память процесса, её же показывает «Диспетчер задач»; koffi и libSystem там нет.
 */
export const readResourceUsage = (): ResourceUsage => {
  const processes = app.getAppMetrics()

  if (IS_WINDOWS) {
    return {
      cpuPercent: processes.reduce((total, { cpu }) => total + cpu.percentCPUUsage, 0),
      // privateBytes - в килобайтах, как и остальная память getAppMetrics.
      memoryBytes: processes.reduce(
        (total, { memory }) => total + (memory.privateBytes ?? 0) * 1024,
        0,
      ),
    }
  }

  const readFootprint = loadFootprintReader()

  return {
    cpuPercent: processes.reduce((total, { cpu }) => total + cpu.percentCPUUsage, 0),
    // Процесс, который завершился между замерами, памяти уже не занимает.
    memoryBytes: readFootprint
      ? processes.reduce((total, { pid }) => total + (readFootprint(pid) ?? 0), 0)
      : null,
  }
}

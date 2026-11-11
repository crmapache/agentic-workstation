import type { KeyStore, MachineRecord, DeviceIdentity } from './keystore'
import { memoryKeyStore } from './keystore'

const DB_NAME = 'agentic-workstation-remote'

const DB_VERSION = 1

const DEVICE_STORE = 'device'

const MACHINE_STORE = 'machines'

const DEVICE_KEY = 'self'

const request = <T>(operation: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result)
    operation.onerror = () => reject(operation.error ?? new Error('IndexedDB request failed'))
  })

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME, DB_VERSION)

    opening.onupgradeneeded = () => {
      const db = opening.result

      if (!db.objectStoreNames.contains(DEVICE_STORE)) db.createObjectStore(DEVICE_STORE)
      if (!db.objectStoreNames.contains(MACHINE_STORE)) {
        db.createObjectStore(MACHINE_STORE, { keyPath: 'agentId' })
      }
    }
    opening.onsuccess = () => resolve(opening.result)
    opening.onerror = () => reject(opening.error ?? new Error('IndexedDB did not open'))
    opening.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'))
  })

/** Транзакция на одно хранилище: запрос и дождаться, пока запись ляжет. */
const run = async <T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  work: (objects: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const transaction = db.transaction(store, mode)
  const done = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'))
  })
  const result = await request(work(transaction.objectStore(store)))

  await done

  return result
}

/**
 * Хранилище пар в IndexedDB: структурное клонирование кладёт неизвлекаемый CryptoKey целиком,
 * без выгрузки байт. Нет IndexedDB (приватный режим) - хранилище в памяти: пара живёт до
 * закрытия страницы, и экран это говорит (persistent false).
 */
export const openKeyStore = async (): Promise<KeyStore> => {
  let db: IDBDatabase

  try {
    db = await openDatabase()
  } catch {
    return memoryKeyStore()
  }

  return {
    persistent: true,
    loadDevice: async () =>
      ((await run(db, DEVICE_STORE, 'readonly', (objects) => objects.get(DEVICE_KEY))) as
        DeviceIdentity | undefined) ?? null,
    saveDevice: async (device) => {
      await run(db, DEVICE_STORE, 'readwrite', (objects) => objects.put(device, DEVICE_KEY))
    },
    loadMachines: async () =>
      (await run(db, MACHINE_STORE, 'readonly', (objects) => objects.getAll())) as MachineRecord[],
    saveMachine: async (machine) => {
      await run(db, MACHINE_STORE, 'readwrite', (objects) => objects.put(machine))
    },
    removeMachine: async (agentId) => {
      await run(db, MACHINE_STORE, 'readwrite', (objects) => objects.delete(agentId))
    },
  }
}

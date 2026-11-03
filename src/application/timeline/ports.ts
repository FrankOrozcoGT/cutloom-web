import type { Timeline } from '@domain/timeline'
import type { Result } from '@application/result'

export type TimelineStorageError = 'STORAGE_FULL' | 'CORRUPTED_DATA' | 'UNKNOWN_ERROR'

export interface TimelineStorage {
  getByProject(projectId: string): Promise<Result<Timeline | null, TimelineStorageError>>
  save(timeline: Timeline): Promise<Result<void, TimelineStorageError>>
  delete(projectId: string): Promise<Result<void, TimelineStorageError>>
  /**
   * Lee y escribe el timeline de projectId dentro de la MISMA transacción
   * IndexedDB (ver runReadModifyWrite en infrastructure/storage/database.ts)
   * — dos llamadas concurrentes (ej. un split y un undo casi simultáneos)
   * ya no pueden pisarse: la segunda espera a que la primera transacción
   * termine antes de leer. `modify` recibe `null` si el proyecto todavía no
   * tiene timeline guardado (createTimeline resuelve ese caso), y puede
   * fallar con un error de dominio propio — ese Result de error se propaga
   * tal cual sin persistir nada.
   */
  readModifyWrite<E>(
    projectId: string,
    modify: (existing: Timeline | null) => Result<Timeline, E>,
  ): Promise<Result<Timeline, TimelineStorageError | E>>
}

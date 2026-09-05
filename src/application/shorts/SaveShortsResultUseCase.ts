import { buildProjectShorts, type ShortScore } from '@domain/shorts'
import { timelineFingerprint, type Timeline } from '@domain/timeline'
import type { TimelineStorage } from '@application/timeline/ports'
import type { ShortsStoragePort } from './ports'

/**
 * Persiste el resultado de un score de shorts recién generado — única
 * ruta que arma un ProjectShorts nuevo desde cero (a diferencia de
 * ShortsStoragePort.updateCropOffset, que hace un patch parcial sobre un
 * registro ya existente). Antes esta orquestación (cargar el timeline,
 * calcular el fingerprint, armar el registro) vivía en ShortsPage.tsx.
 */
export class SaveShortsResultUseCase {
  private readonly shortsStorage: ShortsStoragePort
  private readonly timelineStorage: TimelineStorage

  constructor(shortsStorage: ShortsStoragePort, timelineStorage: TimelineStorage) {
    this.shortsStorage = shortsStorage
    this.timelineStorage = timelineStorage
  }

  async execute(projectId: string, shorts: ShortScore[], warnings: string[]): Promise<void> {
    const timelineResult = await this.timelineStorage.getByProject(projectId)
    const timeline: Timeline | null = timelineResult.ok ? timelineResult.value : null
    const record = buildProjectShorts({
      projectId,
      shorts,
      warnings,
      timelineFingerprint: timeline ? timelineFingerprint(timeline) : undefined,
    })
    await this.shortsStorage.save(record)
  }
}

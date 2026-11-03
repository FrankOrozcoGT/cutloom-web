import { useCallback, useState } from 'react'
import type { Render } from '@domain/render'
import type { AutoFrameKeyframe, NormalizedRect } from '@domain/shorts'
import { analyzeMotionFramingUseCase } from '@ui/shorts/composition'
import { shortsStorage } from '@ui/video/composition'

export type AnalyzeAutoFrameState = 'idle' | 'analyzing' | 'error'

interface UseAutoFramingResult {
  analyzeState: AnalyzeAutoFrameState
  /** Calcula la trayectoria de auto-encuadre de un short y la persiste — no activa el toggle por sí solo, eso es decisión separada del usuario (setAutoFrameEnabled). */
  analyzeAndSave: (
    projectId: string,
    shortKeyValue: string,
    render: Render,
    startMs: number,
    endMs: number,
    excludeRect: NormalizedRect | null,
  ) => Promise<AutoFrameKeyframe[] | null>
  setAutoFrameEnabled: (projectId: string, shortKeyValue: string, enabled: boolean) => Promise<void>
  setMotionExcludeRect: (projectId: string, rect: NormalizedRect | null) => Promise<void>
}

/** Orquesta el análisis de movimiento y la persistencia del auto-encuadre de shorts — ver domain/shorts.ts (AutoFrameKeyframe, findMotionCenter, smoothMotionPath) y AnalyzeMotionFramingUseCase. */
export function useAutoFraming(): UseAutoFramingResult {
  const [analyzeState, setAnalyzeState] = useState<AnalyzeAutoFrameState>('idle')

  const analyzeAndSave = useCallback(
    async (
      projectId: string,
      shortKeyValue: string,
      render: Render,
      startMs: number,
      endMs: number,
      excludeRect: NormalizedRect | null,
    ) => {
      setAnalyzeState('analyzing')
      const result = await analyzeMotionFramingUseCase.execute(render, startMs, endMs, excludeRect)
      if (!result.ok) {
        setAnalyzeState('error')
        return null
      }
      setAnalyzeState('idle')
      await shortsStorage.updateAutoFraming(projectId, shortKeyValue, result.value)
      return result.value
    },
    [],
  )

  const setAutoFrameEnabled = useCallback(async (projectId: string, shortKeyValue: string, enabled: boolean) => {
    await shortsStorage.updateAutoFrameEnabled(projectId, shortKeyValue, enabled)
  }, [])

  const setMotionExcludeRect = useCallback(async (projectId: string, rect: NormalizedRect | null) => {
    await shortsStorage.updateMotionExcludeRect(projectId, rect)
  }, [])

  return { analyzeState, analyzeAndSave, setAutoFrameEnabled, setMotionExcludeRect }
}

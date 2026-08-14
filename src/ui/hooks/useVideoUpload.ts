import { useCallback, useState } from 'react'
import type { UploadError, VideoUploadResult } from '@domain/video'
import { filePicker, uploadVideoUseCase } from '@ui/video/composition'

export type UploadState =
  | 'idle'
  | 'picking'
  | 'validating'
  | 'uploading'
  | 'generating_thumbnail'
  | 'success'
  | 'error'

interface UseVideoUploadResult {
  state: UploadState
  results: VideoUploadResult[]
  errors: UploadError[]
  upload: () => Promise<void>
  uploadFiles: (files: File[]) => Promise<void>
  reset: () => void
}

export function useVideoUpload(projectId: string): UseVideoUploadResult {
  const [state, setState] = useState<UploadState>('idle')
  const [results, setResults] = useState<VideoUploadResult[]>([])
  const [errors, setErrors] = useState<UploadError[]>([])

  const reset = useCallback(() => {
    setState('idle')
    setResults([])
    setErrors([])
  }, [])

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      setState('idle')
      return
    }

    setState('uploading')
    const outcomes = await uploadVideoUseCase.execute(files, projectId)

    const successes: VideoUploadResult[] = []
    const failures: UploadError[] = []
    for (const outcome of outcomes) {
      if (outcome.ok) {
        successes.push(outcome.value)
      } else {
        failures.push(outcome.error)
      }
    }

    setResults(successes)
    setErrors(failures)
    setState(failures.length > 0 && successes.length === 0 ? 'error' : 'success')
  }, [projectId])

  const upload = useCallback(async () => {
    setState('picking')
    const pickResult = await filePicker.pickVideoFiles()
    if (!pickResult.ok) {
      setErrors(['UNKNOWN_ERROR'])
      setState('error')
      return
    }
    await uploadFiles(pickResult.value)
  }, [uploadFiles])

  return { state, results, errors, upload, uploadFiles, reset }
}

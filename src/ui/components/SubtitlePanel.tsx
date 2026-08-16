import { useCallback, useRef } from 'react'
import type { LanguageCode, SubtitleParseError, Subtitles } from '@domain/subtitles'
import type { ExtractSubtitlesAudioError } from '@application/subtitles/ExtractSubtitlesAudioUseCase'
import type { SubtitlesError } from '@application/subtitles/GenerateSubtitlesUseCase'
import type { SubtitlesState } from '@ui/hooks/useSubtitles'
import { Button } from '@ui/components/Button'

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  es: 'Español',
  en: 'English',
}

const ERROR_MESSAGES: Record<string, string> = {
  EMPTY_TIMELINE: 'El timeline está vacío. Agrega al menos un video para generar subtítulos.',
  MISSING_ASSET: 'Uno de los videos del timeline ya no está disponible.',
  NO_SPEECH: 'No se detectó voz en el audio del timeline. Puedes importar un archivo SRT/VTT manualmente.',
  UNSUPPORTED_API: 'Tu navegador no soporta las APIs necesarias para generar subtítulos (WebAssembly/WebCodecs).',
  INSUFFICIENT_HARDWARE: 'Tu dispositivo no tiene suficiente memoria para generar subtítulos localmente. Puedes importar un archivo SRT/VTT manualmente.',
  UNKNOWN_ERROR: 'Ocurrió un error inesperado al generar los subtítulos.',
  PARSE_ERROR: 'El archivo importado no tiene un formato SRT/VTT válido.',
}

function generateButtonLabel(state: SubtitlesState, hasSubtitles: boolean): string {
  if (state === 'extracting_audio') return 'Extrayendo audio…'
  if (state === 'transcribing') return 'Transcribiendo (Whisper)…'
  return hasSubtitles ? 'Regenerar subtítulos' : 'Generar subtítulos'
}

function toggleSegmentsLabel(segmentsVisible: boolean, segmentCount: number): string {
  const action = segmentsVisible ? 'Ocultar' : 'Ver'
  return `${action} segmentos (${segmentCount})`
}

interface SubtitlePanelProps {
  hasTimeline: boolean
  state: SubtitlesState
  subtitles: Subtitles | null
  error: SubtitlesError | ExtractSubtitlesAudioError | SubtitleParseError | null
  language: LanguageCode
  setLanguage: (language: LanguageCode) => void
  generate: () => Promise<void>
  importFile: (content: string, format: 'srt' | 'vtt') => Promise<void>
  segmentsVisible: boolean
  onToggleSegments: () => void
}

export function SubtitlePanel({
  hasTimeline,
  state,
  subtitles,
  error,
  language,
  setLanguage,
  generate,
  importFile,
  segmentsVisible,
  onToggleSegments,
}: SubtitlePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isBusy = state === 'extracting_audio' || state === 'transcribing'

  const handleGenerate = useCallback(() => {
    void generate()
  }, [generate])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      const content = await file.text()
      const format = file.name.toLowerCase().endsWith('.vtt') ? 'vtt' : 'srt'
      await importFile(content, format)
    },
    [importFile],
  )

  if (!hasTimeline) {
    return null
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-strong">Subtítulos automáticos</h3>
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value as LanguageCode)}
          disabled={isBusy}
          className="rounded-md border border-border bg-transparent px-2 py-1 text-xs text-text-strong"
        >
          {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_LABELS[code]}
            </option>
          ))}
        </select>
      </div>

      <Button onClick={handleGenerate} disabled={isBusy} className="w-auto">
        {generateButtonLabel(state, !!subtitles)}
      </Button>

      {state === 'error' && error && (
        <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {ERROR_MESSAGES[error] ?? error}
        </div>
      )}

      <Button variant="secondary" onClick={handleImportClick} className="w-auto">
        Importar SRT/VTT
      </Button>

      <input ref={fileInputRef} type="file" accept=".srt,.vtt" className="hidden" onChange={(event) => void handleFileSelected(event)} />

      {subtitles && subtitles.segments.length > 0 && (
        <Button variant="secondary" onClick={onToggleSegments} className="w-auto">
          {toggleSegmentsLabel(segmentsVisible, subtitles.segments.length)}
        </Button>
      )}
    </div>
  )
}

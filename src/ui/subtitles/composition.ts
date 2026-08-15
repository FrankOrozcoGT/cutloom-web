import { IndexedDBSubtitlesAdapter } from '@infrastructure/storage/IndexedDBSubtitlesAdapter'

// GenerateSubtitlesUseCase se instancia dentro de subtitles.worker.ts, no acá:
// corre en un Web Worker para no bloquear el hilo principal (Whisper en WASM,
// sin GPU, es cómputo síncrono pesado).
export const subtitlesStorage = new IndexedDBSubtitlesAdapter()

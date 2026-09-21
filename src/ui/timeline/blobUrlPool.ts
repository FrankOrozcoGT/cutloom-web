// Pool de blob URLs con conteo de referencias, indexado por assetId (no por
// slot). Antes cada slot (A/B) creaba y revocaba su propia URL de forma
// independiente: si el mismo asset pasaba de un slot a otro, o dos efectos
// se resolvían en un orden distinto al esperado, una URL podía revocarse
// mientras el otro slot (o el <video> que la tenía asignada un instante
// antes) todavía la usaba — carrera real de timing entre "React decidió
// revocar" y "el navegador ya soltó esa referencia". Con un único dueño por
// assetId que solo revoca al llegar a cero referencias, esa carrera deja de
// poder existir: una URL nunca se revoca mientras algo la sigue pidiendo.
interface PoolEntry {
  url: string
  refCount: number
}

const pool = new Map<string, PoolEntry>()

export function acquireBlobUrl(assetId: string, blob: Blob): string {
  const existing = pool.get(assetId)
  if (existing) {
    existing.refCount += 1
    return existing.url
  }
  const url = URL.createObjectURL(blob)
  pool.set(assetId, { url, refCount: 1 })
  return url
}

export function releaseBlobUrl(assetId: string): void {
  const entry = pool.get(assetId)
  if (!entry) return
  entry.refCount -= 1
  if (entry.refCount <= 0) {
    URL.revokeObjectURL(entry.url)
    pool.delete(assetId)
  }
}

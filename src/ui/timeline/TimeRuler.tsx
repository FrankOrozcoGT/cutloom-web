function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

function pickStepSeconds(pxPerSec: number): number {
  const candidates = [1, 2, 5, 10, 30, 60, 120, 300]
  const minPxPerLabel = 60
  return candidates.find((step) => step * pxPerSec >= minPxPerLabel) ?? 300
}

interface TimeRulerProps {
  pxPerSec: number
  widthPx: number
  onClickPosition: (offsetPx: number) => void
}

export function TimeRuler({ pxPerSec, widthPx, onClickPosition }: TimeRulerProps) {
  const stepSeconds = pickStepSeconds(pxPerSec)
  const totalSeconds = Math.max(30, Math.ceil(widthPx / pxPerSec) + stepSeconds)
  const marks = []
  for (let seconds = 0; seconds <= totalSeconds; seconds += stepSeconds) {
    marks.push(seconds)
  }

  return (
    <div
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        onClickPosition(Math.max(0, event.clientX - rect.left))
      }}
      style={{ width: totalSeconds * pxPerSec }}
      className="relative h-6 cursor-pointer border-b border-border"
    >
      {marks.map((seconds) => (
        <div
          key={seconds}
          style={{ left: seconds * pxPerSec }}
          className="absolute top-0 h-full border-l border-border pl-1 text-[10px] text-text-muted"
        >
          {formatTime(seconds)}
        </div>
      ))}
    </div>
  )
}

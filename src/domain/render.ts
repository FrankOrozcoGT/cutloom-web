export interface Render {
  id: string
  projectId: string
  blob: Blob
  timelineFingerprint: string
  createdAt: number
}

export function isRenderStale(render: Render, currentTimelineFingerprint: string): boolean {
  return render.timelineFingerprint !== currentTimelineFingerprint
}

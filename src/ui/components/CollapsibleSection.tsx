import { useState, type ReactNode } from 'react'

interface CollapsibleSectionProps {
  title: string
  badge?: string
  defaultOpen?: boolean
  children: ReactNode
}

export function CollapsibleSection({ title, badge, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg border border-border bg-bg">
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-text-strong">
          {title}
          {badge && (
            <span className="rounded-full bg-accent-bg px-2 py-0.5 text-xs font-normal text-accent">{badge}</span>
          )}
        </span>
        <span className="text-text-muted">{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && <div className="flex flex-col gap-3 border-t border-border p-4">{children}</div>}
    </div>
  )
}

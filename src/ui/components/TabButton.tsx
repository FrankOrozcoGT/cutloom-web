interface TabButtonProps {
  label: string
  isActive: boolean
  onClick: () => void
}

export function TabButton({ label, isActive, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium transition-colors ${
        isActive ? 'border-b-2 border-accent text-text-strong' : 'text-text-muted hover:text-text-strong'
      }`}
    >
      {label}
    </button>
  )
}

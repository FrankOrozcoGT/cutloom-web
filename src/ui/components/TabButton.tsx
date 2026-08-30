interface TabButtonProps {
  label: string
  isActive: boolean
  onClick: () => void
  disabled?: boolean
}

export function TabButton({ label, isActive, onClick, disabled }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-text-muted ${
        isActive ? 'border-b-2 border-accent text-text-strong' : 'text-text-muted hover:text-text-strong'
      }`}
    >
      {label}
    </button>
  )
}

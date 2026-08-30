import { Link } from 'react-router-dom'

export function PremiumNotice() {
  return (
    <div role="status" className="rounded-lg bg-accent-bg px-3 py-2 text-sm text-text-strong">
      Esta herramienta es premium.{' '}
      <Link to="/billing" className="font-medium text-accent hover:underline">
        Ver planes
      </Link>
    </div>
  )
}

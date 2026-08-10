import type { ReactNode } from 'react'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-lg bg-surface p-6 [box-shadow:var(--shadow-dialog)]">
        {children}
      </div>
    </div>
  )
}

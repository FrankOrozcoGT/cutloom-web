import type { ElementType, ReactNode } from 'react'

interface ErrorBannerProps {
  children: ReactNode
  /** 'warning' se usa para avisos no bloqueantes (ej. datos desactualizados) — texto más chico y sin role="alert", ya que no interrumpe un flujo como sí lo hace un error real. */
  variant?: 'danger' | 'warning'
  /** 'p' para uso dentro de un <form>, donde un <div> rompería la semántica esperada. */
  as?: ElementType
}

const VARIANT_CLASSES: Record<NonNullable<ErrorBannerProps['variant']>, string> = {
  danger: 'bg-danger-bg text-danger text-sm',
  warning: 'bg-warning-bg text-warning text-xs',
}

/**
 * Banner de error/warning compartido — antes reimplementado inline (mismas
 * clases `rounded-lg ... px-3 py-2`) en más de 10 archivos distintos
 * (VideoUploader, CreateShortsTool, ImproveSubtitlesTool, SubtitlePanel,
 * ShortCard, Timeline, ShortsPage, ProjectsPage, LoginPage, RegisterPage).
 */
export function ErrorBanner({ children, variant = 'danger', as: Component = 'div' }: ErrorBannerProps) {
  return (
    <Component
      role={variant === 'danger' ? 'alert' : undefined}
      className={`rounded-lg px-3 py-2 ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </Component>
  )
}

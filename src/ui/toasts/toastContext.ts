import { createContext } from 'react'

export type ToastVariant = 'danger' | 'success'

export interface ToastContextValue {
  /** Encola un toast — se descarta solo tras unos segundos. Variant por defecto 'danger' porque hoy el único uso real es reportar errores. */
  showToast: (message: string, variant?: ToastVariant) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

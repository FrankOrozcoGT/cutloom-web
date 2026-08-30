interface BlockingLoaderProps {
  message: string
}

/**
 * Overlay de pantalla completa que bloquea toda interacción mientras corre
 * una llamada al backend que no se puede cancelar a mitad de camino (p.ej.
 * mejorar subtítulos con IA) — mismo lenguaje visual que ConfirmDialog, pero
 * sin botones: el usuario espera a que termine.
 */
export function BlockingLoader({ message }: BlockingLoaderProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/50">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
      <p className="text-sm text-text-strong">{message}</p>
    </div>
  )
}

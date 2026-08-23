import { Link } from 'react-router-dom'

interface DonationResultPageProps {
  result: 'success' | 'cancel'
}

export function DonationResultPage({ result }: DonationResultPageProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 py-16 text-center">
      {result === 'success' ? (
        <>
          <h1 className="text-2xl font-semibold text-text-strong">¡Gracias por el café! ☕</h1>
          <p className="text-text-muted">Tu donación ayuda a mantener CutLoom gratis.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-text-strong">Donación cancelada</h1>
          <p className="text-text-muted">No se realizó ningún cargo.</p>
        </>
      )}
      <Link to="/" className="text-sm text-accent hover:underline">
        Volver al inicio
      </Link>
    </div>
  )
}

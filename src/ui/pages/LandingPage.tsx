import { Link } from 'react-router-dom'
import { useAuth } from '@ui/auth/useAuth'
import { Button } from '@ui/components/Button'

const FREE_FEATURES = [
  {
    title: 'Editor privado',
    description: 'Subí tus videos, cortalos y organizalos en un timeline. Todo corre en tu navegador, nada se sube a un servidor.',
  },
  {
    title: 'Subtítulos automáticos',
    description: 'Transcripción con IA (Whisper) corriendo localmente, sin depender de un servicio externo.',
  },
  {
    title: 'Exportación con subtítulos',
    description: 'Exportá tu video final con los subtítulos ya incrustados, listo para publicar.',
  },
]

export function LandingPage() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-20 p-6 py-16">
      <section className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-bold text-text-strong sm:text-5xl">Menos clics, más contenido.</h1>
        <p className="max-w-xl text-lg text-text-muted">
          Editá tu video en el navegador, sin subir nada a la nube. Subtítulos automáticos con IA, corte de clips y,
          con premium, detección de los mejores momentos para convertirlo en contenido listo para tus redes.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link to="/projects">
            <Button className="w-fit px-6">Empezar gratis</Button>
          </Link>
          {!isAuthenticated && (
            <Link to="/login" className="text-sm text-text-muted hover:text-text-strong hover:underline">
              Iniciar sesión
            </Link>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-8">
        <h2 className="text-center text-2xl font-semibold text-text-strong">Gratis, sin letra pequeña</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {FREE_FEATURES.map((feature) => (
            <div key={feature.title} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-6">
              <h3 className="font-medium text-text-strong">{feature.title}</h3>
              <p className="text-sm text-text-muted">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-center gap-4 text-center">
        <div>
          <h2 className="text-2xl font-semibold text-text-strong">Planes premium</h2>
          <p className="mt-1 text-text-muted">Para cuando necesitás más que lo gratuito.</p>
        </div>
        <Link to="/billing">
          <Button className="w-fit px-6">Ver planes</Button>
        </Link>
      </section>
    </div>
  )
}

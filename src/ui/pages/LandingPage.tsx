import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Plan } from '@domain/billing'
import { useAuth } from '@ui/auth/useAuth'
import { Button } from '@ui/components/Button'
import { billingApi } from '@ui/billing/composition'

function formatAmount(amountInCents: number, currency: string): string {
  return new Intl.NumberFormat('es-GT', { style: 'currency', currency }).format(amountInCents / 100)
}

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
  const [plans, setPlans] = useState<Plan[]>([])
  const [plansLoaded, setPlansLoaded] = useState(false)

  useEffect(() => {
    void billingApi.getPlans().then((result) => {
      if (result.ok) {
        setPlans(result.value)
      }
      setPlansLoaded(true)
    })
  }, [])

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

      {plansLoaded && (
        <section className="flex flex-col gap-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-text-strong">Planes premium</h2>
            <p className="mt-1 text-text-muted">Para cuando necesitás más que lo gratuito.</p>
          </div>
          {plans.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {plans.map((plan) => (
                <div key={plan.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-6">
                  <h3 className="text-lg font-semibold text-text-strong">{plan.name}</h3>
                  <p className="text-2xl font-bold text-text-strong">
                    {formatAmount(plan.amountInCents, plan.currency)}
                    <span className="text-sm font-normal text-text-muted"> / {plan.interval}</span>
                  </p>
                  <ul className="flex flex-col gap-1 text-sm text-text-muted">
                    {plan.features.map((feature) => (
                      <li key={feature.feature}>
                        • {feature.feature}
                        {feature.usageLimit !== null && ` (${feature.usageLimit}/mes)`}
                      </li>
                    ))}
                  </ul>
                  <Link to={isAuthenticated ? '/billing' : '/register'}>
                    <Button className="mt-2">{isAuthenticated ? 'Suscribirme' : 'Comenzar'}</Button>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-text-muted">
              Próximamente.
            </div>
          )}
        </section>
      )}
    </div>
  )
}

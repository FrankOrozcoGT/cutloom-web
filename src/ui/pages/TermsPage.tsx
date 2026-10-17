import { APP_NAME } from '@ui/branding'

export function TermsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 py-16">
      <h1 className="text-3xl font-bold text-text-strong">Términos de Servicio</h1>
      <p className="text-sm text-text-muted">Última actualización: 17 de octubre de 2026</p>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-strong">1. Aceptación de los términos</h2>
        <p className="text-text-muted">
          Al acceder o usar {APP_NAME}, aceptás estos Términos de Servicio. Si no estás de acuerdo con alguna parte,
          no debés usar el servicio.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-strong">2. Descripción del servicio</h2>
        <p className="text-text-muted">
          {APP_NAME} es una herramienta de edición de video que corre en tu navegador, con funciones de transcripción
          automática, generación de metadata asistida por IA y publicación directa a plataformas como YouTube y
          TikTok mediante sus APIs oficiales.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-strong">3. Cuentas y conexión con plataformas de terceros</h2>
        <p className="text-text-muted">
          Para publicar contenido, podés conectar tu cuenta de {APP_NAME} con tu cuenta de YouTube y/o TikTok
          mediante OAuth. Vos autorizás expresamente a {APP_NAME} a publicar video en tu nombre únicamente cuando
          lo solicitás explícitamente a través de la interfaz. Podés revocar este acceso en cualquier momento desde
          la configuración de tu cuenta de {APP_NAME} o directamente desde la plataforma correspondiente.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-strong">4. Contenido del usuario</h2>
        <p className="text-text-muted">
          Sos el único responsable del contenido que subís, editás y publicás a través de {APP_NAME}. No reclamamos
          propiedad sobre tu contenido. Sos responsable de contar con los derechos necesarios sobre cualquier video,
          audio o material que proceses en la plataforma.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-strong">5. Uso aceptable</h2>
        <p className="text-text-muted">
          No está permitido usar {APP_NAME} para publicar contenido ilegal, difamatorio, que infrinja derechos de
          terceros, o que viole los términos de servicio de las plataformas de destino (YouTube, TikTok).
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-strong">6. Planes y créditos</h2>
        <p className="text-text-muted">
          Algunas funciones (transcripción mejorada con IA, detección de momentos destacados, publicación
          automática) consumen créditos según el plan contratado. Los términos específicos de facturación se
          detallan en la sección de planes dentro de la aplicación.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-strong">7. Cambios en el servicio</h2>
        <p className="text-text-muted">
          Podemos modificar o discontinuar funciones de {APP_NAME} en cualquier momento. Notificaremos cambios
          relevantes a estos términos actualizando la fecha de esta página.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-strong">8. Contacto</h2>
        <p className="text-text-muted">
          Para consultas sobre estos términos, escribinos a{' '}
          <a href="mailto:soporte@clipcopilot.app" className="text-accent hover:underline">
            soporte@clipcopilot.app
          </a>
          .
        </p>
      </section>
    </div>
  )
}

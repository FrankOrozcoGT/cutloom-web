import { APP_NAME } from '@ui/branding'

export function PrivacyPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 py-16">
      <h1 className="text-3xl font-bold text-text-strong">Política de Privacidad</h1>
      <p className="text-sm text-text-muted">Última actualización: 17 de octubre de 2026</p>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-strong">1. Qué datos recolectamos</h2>
        <p className="text-text-muted">
          Al usar {APP_NAME} recolectamos: datos de tu cuenta (email, nombre), metadata de los proyectos que creás
          (títulos, descripciones generadas), y, si conectás tu cuenta de YouTube o TikTok, el token de acceso
          necesario para publicar en tu nombre y datos básicos de tu perfil en esa plataforma (nombre de canal,
          email asociado).
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-strong">2. Procesamiento de video y audio</h2>
        <p className="text-text-muted">
          La edición de video y la transcripción automática (subtítulos) corren localmente en tu navegador — el
          archivo de video original no se sube a nuestros servidores durante ese proceso. Cuando elegís publicar un
          video a YouTube o TikTok, el archivo final se sube a nuestros servidores únicamente para completar esa
          publicación, y no se retiene más tiempo del necesario para ese fin.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-strong">3. Uso de los datos de YouTube/TikTok</h2>
        <p className="text-text-muted">
          Los tokens de acceso de YouTube y TikTok se usan exclusivamente para: (a) publicar el video que vos
          solicitás explícitamente desde la interfaz de {APP_NAME}, y (b) consultar el estado de esa publicación.
          Nunca accedemos, leemos ni compartimos contenido de tu cuenta de YouTube/TikTok más allá de lo necesario
          para esas dos acciones. No vendemos ni compartimos estos datos con terceros con fines publicitarios.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-strong">4. Con quién compartimos datos</h2>
        <p className="text-text-muted">
          Compartimos datos únicamente con los proveedores necesarios para operar el servicio: procesador de pagos
          (para suscripciones y créditos), proveedor de infraestructura (hosting y almacenamiento), y las APIs
          oficiales de YouTube/TikTok (únicamente para publicar el contenido que vos autorizás).
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-strong">5. Retención y eliminación</h2>
        <p className="text-text-muted">
          Conservamos tus datos de cuenta y proyectos mientras tu cuenta esté activa. Podés solicitar la eliminación
          completa de tu cuenta y datos asociados en cualquier momento escribiéndonos por correo. Revocar la
          conexión con YouTube o TikTok elimina inmediatamente el token de acceso guardado.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-strong">6. Tus derechos</h2>
        <p className="text-text-muted">
          Podés acceder, corregir o eliminar tus datos personales, y revocar el acceso de {APP_NAME} a tu cuenta de
          YouTube o TikTok en cualquier momento, tanto desde la configuración de {APP_NAME} como directamente desde
          esas plataformas.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-strong">7. Contacto</h2>
        <p className="text-text-muted">
          Para consultas sobre privacidad o para solicitar la eliminación de tus datos, escribinos a{' '}
          <a href="mailto:soporte@clipcopilot.app" className="text-accent hover:underline">
            soporte@clipcopilot.app
          </a>
          .
        </p>
      </section>
    </div>
  )
}

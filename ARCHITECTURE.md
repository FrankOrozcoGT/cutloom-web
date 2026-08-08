# Arquitectura general — CutLoom Web

Este documento cubre lo que siempre debe saberse sobre este repo: principios, capas y reglas generales. No describe features concretas (eso vive en la capa de navegación/planning) ni implementación (eso vive en el código).

## Principios

- **Clean Architecture** también en el frontend: la lógica de dominio (reglas de edición, timeline, qué es un clip válido) no depende de React ni de detalles del navegador (WebCodecs, transformers.js). Esas dependencias se acceden vía adaptadores, para poder testear el dominio sin un navegador real y para poder cambiar de librería (ej. otro runtime de transcripción) sin tocar reglas de negocio.
- El editor es **client-first**: todo lo que se pueda resolver sin servidor, se resuelve sin servidor. El backend (`cutloom-api`) solo se consulta cuando es estrictamente necesario (persistencia multi-dispositivo, publicar, features premium).

## Capas

- **domain/** — Modelo de edición: Proyecto, Clip, Timeline, Corte. Reglas puras (ej. "un corte no puede tener duración negativa"), sin dependencia de React ni del navegador.
- **application/** — Casos de uso (ej. `CutClipUseCase`, `GenerateSubtitlesUseCase`, `ExportProjectUseCase`). Dependen de puertos (interfaces), no de implementaciones concretas.
- **infrastructure/** — Adaptadores concretos: WebCodecs para decode/encode, transformers.js para Whisper, cliente HTTP hacia `cutloom-api`.
- **ui/** — Componentes React, estado de interfaz, el timeline visual. Consume casos de uso, no implementa reglas de negocio.

## Multitenancy (vista desde el frontend)

El tenant (Organización) y la sesión del usuario se resuelven contra `cutloom-api`. El frontend no implementa reglas de tenancy — las consulta y las respeta (ej. qué features están disponibles según el plan del tenant activo).

## Modelo free/paid (Entitlements)

- **Gratis, 100% client-side, sin backend**: corte/pegado de clips, timeline, subtítulos automáticos (Whisper vía transformers.js).
- **Premium, requiere backend**: detección de shorts vía emociones (`shorts_ai`). El frontend arma la transcripción (ya la tiene, la generó Whisper localmente) y se la envía a `cutloom-api`, que valida el entitlement antes de encolar el pipeline.
- El frontend nunca decide por sí mismo si una feature está desbloqueada — siempre confía en la respuesta del backend (fuente de verdad del entitlement).

## Frontera con cutloom-api

Toda comunicación con el backend pasa por un único adaptador HTTP en `infrastructure/`. La UI y los casos de uso no llaman a `fetch` directamente ni conocen la forma de la API — así, si cambia el contrato del backend, el impacto queda contenido en una sola capa.

# CutLoom Web

Editor de video en el navegador: sube clips, agrúpalos, córtalos con vista de timeline, agrega subtítulos automáticos y detecta los mejores momentos para shorts.

Frontend de [CutLoom](https://github.com/) — la contraparte backend vive en `cutloom-api`.

## Stack

- **React + Vite** — SPA, sin SSR (no aporta valor para un editor tipo app).
- **WebCodecs API** — decode/encode de video con aceleración de hardware, directo en el navegador.
- **Whisper vía transformers.js** — transcripción para subtítulos automáticos, 100% client-side (sin servidor, sin costo, sin API key).

## Arquitectura general del producto

El procesamiento de video pesado (cortar, previsualizar, exportar, transcribir) ocurre **en el navegador del usuario**, no en un servidor — el video nunca se sube salvo que el usuario decida publicar el resultado final.

El backend (`cutloom-api`) solo entra en juego para:
- Autenticación y persistencia de proyectos.
- Publicar directamente a YouTube / TikTok vía sus APIs (requiere OAuth, no puede vivir en el cliente).
- Feature premium: detección de emociones en video para sugerir shorts (pipeline: Whisper → filtro de candidatos por texto vía LLM → SenseVoice sobre los tramos acotados).

## Licencia

Apache License 2.0 — ver [LICENSE](./LICENSE).

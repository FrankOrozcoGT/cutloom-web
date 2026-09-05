export interface Project {
  id: string
  name: string
  createdAt: string
  /** Resumen del video — se completa solo con el `summary` que devuelve la mejora de subtítulos por IA, editable a mano desde el listado de proyectos. */
  description?: string
}

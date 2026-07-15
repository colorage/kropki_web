/** Resolve a public asset path against Vite base (GitHub Pages project URL). */
export function asset(path: string): string {
  const clean = path.replace(/^\//, '')
  const base = import.meta.env.BASE_URL || '/'
  return `${base}${clean}`
}

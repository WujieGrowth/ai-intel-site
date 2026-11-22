/** Prefix a site path with Astro's base URL. `path` should not start with a slash. */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const suffix = path.replace(/^\/+/, "");
  if (!suffix) return base;
  return base.endsWith("/") ? `${base}${suffix}` : `${base}/${suffix}`;
}

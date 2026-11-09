/**
 * `?debug=1` (or `?debug`): the hero's diagnostic overlay, plus continuous rendering so the
 * frame timings are real. Harmless in production: it only adds a read-only panel.
 */
export function isDebugRequested(search: string): boolean {
  const value = new URLSearchParams(search).get('debug');
  return value !== null && value !== '0' && value !== 'false';
}

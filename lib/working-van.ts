// A saved selection is a convenience, never an authorisation grant.
// Explicit requests for unassigned vans fail; stale saved/default vans are ignored.
export function resolveWorkingVanId(
  authorisedIds: string[],
  requestedId?: string | null,
  savedId?: string | null,
  defaultId?: string | null,
): string | null {
  const allowed = new Set(authorisedIds)
  if (requestedId && !allowed.has(requestedId)) throw new Error('You are not authorised to access that van')
  if (requestedId) return requestedId
  if (savedId && allowed.has(savedId)) return savedId
  if (defaultId && allowed.has(defaultId)) return defaultId
  return null
}

// A short-term, per-visitor brake kept in memory: counts per IP per minute, nothing else.
// Each server instance keeps its own counts, so this slows abuse rather than capping it;
// the daily caps in the database are the firm limits.

/** @returns {(ip: string, limit: number) => boolean} true when this request is over the limit */
export function createMinuteLimiter() {
  const hits = new Map()
  let current = null
  return (ip, limit) => {
    const minute = Math.floor(Date.now() / 60000)
    if (minute !== current) { hits.clear(); current = minute } // drop last minute's counts once, not on every request
    const n = (hits.get(ip) || 0) + 1
    hits.set(ip, n)
    return n > limit
  }
}

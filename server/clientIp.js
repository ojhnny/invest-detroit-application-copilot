// The visitor's IP address, for rate limits and daily caps only (it is hashed, never stored).
//
// The first X-Forwarded-For entry is written by the visitor's own browser or script, so on its
// own it can be faked to dodge the limits. On Render, traffic comes through Cloudflare, which sets
// CF-Connecting-IP / True-Client-IP; visitors can't fake those, so they are used when present
// (Render sets RENDER in the environment). Otherwise we fall back to the old behavior (first
// X-Forwarded-For entry), then to the connection's own address.

const first = (v) => String(v || '').split(',')[0].trim()

/**
 * @param {{ headers?: object, socket?: { remoteAddress?: string } }} req
 * @param {object} [env]
 */
export function clientIp(req, env = process.env) {
  const h = req?.headers || {}
  if (env.RENDER) {
    const ip = first(h['cf-connecting-ip']) || first(h['true-client-ip'])
    if (ip) return ip
  }
  return first(h['x-forwarded-for']) || req?.socket?.remoteAddress || 'unknown'
}

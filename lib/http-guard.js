/**
 * HTTP guard utilities for protecting read and write endpoints
 * against drive-by CSRF, unauthorized cross-network access, DNS rebinding, and cross-origin tampering.
 * Enforces DSH Host Connection authentication for external LAN/WAN clients (#346, #347).
 */

export function isLoopbackAddress(ip) {
  if (!ip || typeof ip !== "string") return false
  const clean = ip.replace(/^::ffff:/, "").toLowerCase()
  return (
    clean === "127.0.0.1" ||
    clean === "::1" ||
    clean.startsWith("127.") ||
    clean === "localhost" ||
    clean === "[::1]"
  )
}

export function isLanAddress(ip) {
  if (!ip || typeof ip !== "string") return false
  const clean = ip.replace(/^::ffff:/, "")
  if (isLoopbackAddress(clean)) return true
  if (clean.startsWith("10.") || clean.startsWith("192.168.")) return true
  const match172 = clean.match(/^172\.(\d+)\./)
  if (match172) {
    const octet = parseInt(match172[1], 10)
    if (octet >= 16 && octet <= 31) return true
  }
  return false
}

export function isTrustedHost(host) {
  if (!host || typeof host !== "string") return false
  let hostname = host.trim()
  if (hostname.startsWith("[")) {
    const end = hostname.indexOf("]")
    if (end > 0) hostname = hostname.slice(1, end)
  } else {
    hostname = hostname.split(":")[0]
  }
  hostname = hostname.toLowerCase()
  if (!hostname) return false
  if (hostname === "localhost" || hostname.endsWith(".local")) return true
  if (isLoopbackAddress(hostname) || isLanAddress(hostname)) return true
  return false
}

export function getClientIp(req) {
  return (
    req?.socket?.remoteAddress ||
    req?.connection?.remoteAddress ||
    req?.info?.remoteAddress ||
    ""
  )
}

/**
 * Evaluates whether an incoming HTTP request is trusted and authenticated (#346, #347).
 *
 * Requirements:
 * 1. If DSH connection service is available (options.connection), requestRejection(req)
 *    is the authoritative gate for browser session authentication and trusted network access.
 *    If rejection is returned, the numeric status (e.g. 401 or 403) is returned.
 * 2. Host header is required and must pass isTrustedHost (prevents DNS rebinding).
 * 3. Cross-site requests (sec-fetch-site: cross-site) are strictly rejected with 403.
 * 4. Origin & Referer headers (if present) must match Host or a trusted host.
 * 5. Fallback when connection service is absent (unit tests, standalone runner):
 *    - Loopback callers (127.0.0.1, ::1) are allowed.
 *    - Non-loopback / remote / LAN callers without connection authentication are rejected with 403 (fail closed).
 *    - Unknown remote address (socket present but empty remoteAddress) fails closed with 403.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {{ connection?: { requestRejection?: (req: any) => number | undefined } }} [options]
 * @returns {number|undefined} Rejection HTTP status code (401, 403), or undefined if allowed.
 */
export function getRejectionStatus(req, options = {}) {
  const connection = options?.connection
  if (connection && typeof connection.requestRejection === "function") {
    try {
      const rejection = connection.requestRejection(req)
      // The DSH Connection fence is authoritative when it is mounted: it already
      // validates the Host/Origin pair against the deployment's trusted hosts
      // (which the local fallback cannot know) and the browser session cookie.
      // Returning here is required — falling through re-applied the loopback-only
      // fallback and turned an admitted Tailscale/LAN request into 403.
      if (rejection === undefined) return undefined
      if (typeof rejection === "number" && Number.isInteger(rejection) && rejection >= 400 && rejection < 600) {
        return rejection
      }
      return rejection === 401 ? 401 : 403
    } catch {
      // Fail closed if connection service throws
      return 403
    }
  }

  const headers = req?.headers || {}
  const host = headers.host || ""

  // 1. Host header must be present and trusted
  if (!host || !isTrustedHost(host)) {
    return 403
  }

  // 2. Strict rejection of cross-site requests
  const site = headers["sec-fetch-site"]
  if (site !== undefined && site === "cross-site") {
    return 403
  }

  // 3. Origin header validation if present
  const origin = headers.origin
  if (origin !== undefined) {
    if (origin === "null" || !origin) return 403
    try {
      const parsed = new URL(origin)
      if (!isTrustedHost(parsed.hostname) && parsed.host !== host) return 403
    } catch {
      return 403
    }
  }

  // 4. Referer header validation if present
  const referer = headers.referer
  if (referer !== undefined && referer) {
    try {
      const parsed = new URL(referer)
      if (!isTrustedHost(parsed.hostname) && parsed.host !== host) return 403
    } catch {
      return 403
    }
  }

  // 5. Network boundary validation when connection service is absent:
  const hasSocket = !!(req?.socket || req?.connection)
  const ip = getClientIp(req)

  if (hasSocket) {
    // Fail closed on missing/unknown remoteAddress
    if (!ip) {
      return 403
    }
    // Remote/LAN callers without connection authentication are rejected
    if (!isLoopbackAddress(ip)) {
      if (!connection) {
        return 403
      }
    }
  } else if (!connection) {
    // Synthetic mock request without socket: allow loopback host for unit tests
    const hostname = host.split(":")[0].toLowerCase()
    if (!isLoopbackAddress(hostname) && hostname !== "localhost") {
      return 403
    }
  }

  return undefined
}

/**
 * Evaluates whether an incoming HTTP write request is safe for mutation (#346).
 *
 * Requirements:
 * 1. Must satisfy all getRejectionStatus checks (including connection.requestRejection).
 * 2. When the DSH Connection fence is mounted it is authoritative: it accepts the
 *    deployment's trusted Host/Origin pairs and authenticated browser session, so
 *    this function delegates the same-origin decision to it.
 * 3. Fallback only (no Connection service), an Origin/Referer header must match
 *    Host exactly, Sec-Fetch-Site must be "same-origin" or "none", and the caller
 *    must be local loopback.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {{ connection?: { requestRejection?: (req: any) => number | undefined } }} [options]
 * @returns {number|undefined} Rejection HTTP status code (401, 403), or undefined if allowed.
 */
export function getWriteRejectionStatus(req, options = {}) {
  const readStatus = getRejectionStatus(req, options)
  if (readStatus !== undefined) {
    return readStatus
  }

  // When the DSH Connection fence is mounted it is authoritative for both reads
  // and writes: its Host/Origin fence already rejects cross-site writes for the
  // deployment's trusted authorities (which this module cannot enumerate). Do not
  // re-apply the loopback-only same-origin heuristics on top of it — a proxy may
  // legitimately present `host:443` while the browser Origin omits the default
  // port, and the duplicate comparison would reject an admitted write.
  const connection = options?.connection
  if (connection && typeof connection.requestRejection === "function") {
    return undefined
  }

  const headers = req?.headers || {}
  const host = headers.host || ""

  const origin = headers.origin
  if (origin !== undefined) {
    if (origin === "null" || !origin) return 403
    try {
      const parsed = new URL(origin)
      if (parsed.host && host && parsed.host !== host) return 403
    } catch {
      return 403
    }
  }

  const referer = headers.referer
  if (referer !== undefined && referer) {
    try {
      const parsed = new URL(referer)
      if (parsed.host && host && parsed.host !== host) return 403
    } catch {
      return 403
    }
  }

  const site = headers["sec-fetch-site"]
  if (site !== undefined && site) {
    if (site !== "same-origin" && site !== "none") return 403
  }

  // Fallback (no Connection service): writes stay loopback-only.
  const ip = getClientIp(req)
  if (!ip || !isLoopbackAddress(ip)) {
    return 403
  }

  return undefined
}

export function isTrustedRequest(req, options = {}) {
  return getRejectionStatus(req, options) === undefined
}

export function rejectUntrustedRequest(req, res, options = {}) {
  const status = getRejectionStatus(req, options)
  if (status !== undefined) {
    try {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      })
      res.end(
        JSON.stringify({
          ok: false,
          error: {
            code: status === 401 ? "unauthorized" : "forbidden",
            message: status === 401
              ? "Unauthorized: authentication required"
              : "Forbidden: untrusted origin or network",
          },
        })
      )
    } catch {
      /* socket closed */
    }
    return true
  }
  return false
}

export function isTrustedWriteRequest(req, options = {}) {
  return getWriteRejectionStatus(req, options) === undefined
}

export function rejectUntrustedWrite(req, res, options = {}) {
  const status = getWriteRejectionStatus(req, options)
  if (status !== undefined) {
    try {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      })
      res.end(
        JSON.stringify({
          ok: false,
          error: {
            code: status === 401 ? "unauthorized" : "forbidden",
            message: status === 401
              ? "Unauthorized: authentication required"
              : "Forbidden: same-origin or local loopback only",
          },
        })
      )
    } catch {
      /* socket closed */
    }
    return true
  }
  return false
}

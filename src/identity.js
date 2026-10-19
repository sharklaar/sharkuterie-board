import { findPerson } from "./organisation.js";

let cachedKeys;
let keysExpire = 0;
function decode(value) {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}

export async function authenticatedPerson(request, env) {
  try {
    const hostname = new URL(request.url).hostname;
    // Explicit opt-in in ignored .dev.vars; never accepted on deployed hostnames.
    if (["localhost", "127.0.0.1", "[::1]"].includes(hostname) && env.LOCAL_USER_EMAIL) {
      const email = env.LOCAL_USER_EMAIL.trim().toLowerCase();
      const person = await findPerson(env, email);
      if (person) return { email, person, development: true };
    }
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token || !env.ACCESS_ISSUER || !env.ACCESS_AUD) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Date.now() / 1000;
    if (header.alg !== "RS256" || claims.iss !== env.ACCESS_ISSUER ||
        !Number.isFinite(claims.exp) || claims.exp <= now ||
        (claims.nbf != null && (!Number.isFinite(claims.nbf) || claims.nbf > now)) ||
        ![].concat(claims.aud || []).includes(env.ACCESS_AUD)) return null;
    if (!cachedKeys || keysExpire < Date.now() || cachedKeys.issuer !== env.ACCESS_ISSUER ||
        !cachedKeys.keys.some(key => key.kid === header.kid)) {
      const response = await fetch(`${env.ACCESS_ISSUER}/cdn-cgi/access/certs`);
      if (!response.ok) return null;
      cachedKeys = { issuer: env.ACCESS_ISSUER, keys: (await response.json()).keys };
      keysExpire = Date.now() + 3600000;
    }
    const jwk = cachedKeys.keys.find(key => key.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) return null;
    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    const person = await findPerson(env, email);
    // Unlisted authenticated users retain access; their verified email is stored
    // privately so their name can be resolved when the org list is updated.
    return email ? { email, person: person || null } : null;
  } catch {
    return null;
  }
}

export function publicActivity(row, organisation) {
  const person = organisation.find(person => person.id === row.person_id) ||
    organisation.find(person => person.email?.toLowerCase() === row.actor_email);
  return { action: row.action, name: person?.name || row.actor_name || "Unknown", position: person?.position || row.actor_position || null, occurred_at: row.occurred_at };
}

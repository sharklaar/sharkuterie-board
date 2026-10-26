export async function findMemberships(env, email) {
  const rows = await env.DB.prepare(`SELECT u.id, u.name, u.position, u.email, u.access, u.organisation_id,
    o.name AS organisation_name, o.type AS organisation_type FROM organisation_users u JOIN organisations o ON o.id = u.organisation_id
    WHERE u.active = 1 AND lower(u.email) = ? ORDER BY o.name COLLATE NOCASE`).bind(email.toLowerCase()).all();
  return rows.results.map(row => ({ ...row, admin: row.access === "admin" }));
}

export async function manageOrganisation(request, env, actor, id) {
  const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!actor) return json({ error: "Please sign in." }, 401);
  if (!actor.person?.admin) return json({ error: "Only admins can manage the organisation." }, 403);
  const org = actor.person.organisation_id;
  if (request.method === "GET" && !id) {
    const rows = await env.DB.prepare(`SELECT id, name, position, email, access FROM organisation_users
      WHERE active = 1 AND organisation_id = ? ORDER BY name COLLATE NOCASE`).bind(org).all();
    return json({ users: rows.results.map(row => ({ ...row, admin: row.access === "admin" })) });
  }
  if (!((request.method === "POST" && !id) || (id && ["PUT", "DELETE"].includes(request.method)))) return json({ error: "Method not allowed" }, 405);
  try {
    if (request.method === "DELETE") {
      const result = await env.DB.prepare(`UPDATE organisation_users SET active = 0
        WHERE id = ? AND organisation_id = ? AND active = 1 AND (access != 'admin' OR
          EXISTS (SELECT 1 FROM organisation_users WHERE organisation_id = ? AND active = 1 AND access = 'admin' AND id != ? AND email IS NOT NULL)) RETURNING id`)
        .bind(id, org, org, id).first();
      if (!result) return json({ error: "User not found, or removing them would leave no admin with an email." }, 409);
      return json({ deleted: true });
    }
    if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "User details must be JSON." }, 400);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "User details are invalid." }, 400);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const position = typeof body.position === "string" ? body.position.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() || null : null;
    // Older clients submit an admin boolean; new clients use explicit access levels.
    const access = body.access ?? (typeof body.admin === "boolean" ? (body.admin ? "admin" : "member") : null);
    if ((body.email != null && typeof body.email !== "string") || !name || !position || name.length > 120 || position.length > 120 ||
        (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) || !["member", "editor", "admin"].includes(access)) {
      return json({ error: "Enter a name, position, access level and valid optional email." }, 400);
    }
    if (access === "admin" && !email) return json({ error: "Admins need an email address to sign in." }, 400);
    if (!id) {
      const userId = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO organisation_users (id, name, position, email, admin, access, organisation_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(userId, name, position, email, Number(access === "admin"), access, org).run();
      return json({ id: userId }, 201);
    }
    const updated = await env.DB.prepare(`UPDATE organisation_users SET name = ?, position = ?, email = ?, admin = ?, access = ?
      WHERE id = ? AND organisation_id = ? AND active = 1 AND (? = 'admin' OR access != 'admin' OR EXISTS
        (SELECT 1 FROM organisation_users WHERE organisation_id = ? AND active = 1 AND access = 'admin' AND email IS NOT NULL AND id != ?)) RETURNING id`)
      .bind(name, position, email, Number(access === "admin"), access, id, org, access, org, id).first();
    return updated ? json(updated) : json({ error: "User not found, or this change would leave no admin." }, 409);
  } catch (error) {
    if (error.message?.includes("UNIQUE")) return json({ error: "That email already belongs to another user in this organisation." }, 409);
    if (error instanceof SyntaxError) return json({ error: "User details could not be read." }, 400);
    console.error(error);
    return json({ error: "Could not update the organisation." }, 500);
  }
}

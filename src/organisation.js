export async function findPerson(env, email) {
  const row = await env.DB.prepare("SELECT id, name, position, email, admin FROM organisation_users WHERE active = 1 AND lower(email) = ?")
    .bind(email.toLowerCase()).first();
  return row ? { ...row, admin: Boolean(row.admin) } : null;
}

export async function manageOrganisation(request, env, actor, id) {
  const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!actor) return json({ error: "Please sign in." }, 401);
  if (!actor.person?.admin) return json({ error: "Only admins can manage the organisation." }, 403);
  if (request.method === "GET" && !id) {
    const rows = await env.DB.prepare("SELECT id, name, position, email, admin FROM organisation_users WHERE active = 1 ORDER BY name COLLATE NOCASE").all();
    return json({ users: rows.results.map(row => ({ ...row, admin: Boolean(row.admin) })) });
  }
  if (!((request.method === "POST" && !id) || (id && ["PUT", "DELETE"].includes(request.method)))) return json({ error: "Method not allowed" }, 405);
  try {
    if (request.method === "DELETE") {
      const result = await env.DB.prepare(`UPDATE organisation_users SET active = 0
        WHERE id = ? AND active = 1 AND (admin = 0 OR
          EXISTS (SELECT 1 FROM organisation_users WHERE active = 1 AND admin = 1 AND id != ? AND email IS NOT NULL)) RETURNING id`)
        .bind(id, id).first();
      if (!result) return json({ error: "User not found, or removing them would leave no admin with an email." }, 409);
      return json({ deleted: true });
    }
    if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "User details must be JSON." }, 400);
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const position = typeof body?.position === "string" ? body.position.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() || null : null;
    if ((body.email != null && typeof body.email !== "string") || !name || !position || name.length > 120 || position.length > 120 ||
        (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) || typeof body.admin !== "boolean") {
      return json({ error: "Enter a name, position and valid optional email." }, 400);
    }
    if (body.admin && !email) return json({ error: "Admins need an email address to sign in." }, 400);
    if (!id) {
      const userId = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO organisation_users (id, name, position, email, admin) VALUES (?, ?, ?, ?, ?)").bind(userId, name, position, email, Number(body.admin)).run();
      return json({ id: userId }, 201);
    }
    const updated = await env.DB.prepare(`UPDATE organisation_users SET name = ?, position = ?, email = ?, admin = ?
      WHERE id = ? AND active = 1 AND (? = 1 OR admin = 0 OR EXISTS
        (SELECT 1 FROM organisation_users WHERE active = 1 AND admin = 1 AND email IS NOT NULL AND id != ?)) RETURNING id`)
      .bind(name, position, email, Number(body.admin), id, Number(body.admin), id).first();
    return updated ? json(updated) : json({ error: "User not found, or this change would leave no admin." }, 409);
  } catch (error) {
    if (error.message?.includes("UNIQUE")) return json({ error: "That email already belongs to another user." }, 409);
    if (error instanceof SyntaxError) return json({ error: "User details could not be read." }, 400);
    console.error(error);
    return json({ error: "Could not update the organisation." }, 500);
  }
}

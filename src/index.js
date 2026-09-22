export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/test") {
      const recipe = await env.DB
        .prepare("SELECT * FROM recipes WHERE slug = ?")
        .bind("test-recipe")
        .first();

      return Response.json(recipe);
    }

    return env.ASSETS.fetch(request);
  },
};
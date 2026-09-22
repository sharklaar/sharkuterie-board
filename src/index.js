export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/recipes") {
  const recipes = await env.DB
    .prepare(`
      SELECT
        id,
        name,
        slug,
        description,
        serves,
        heat_level,
        total_time_minutes,
        image_path
      FROM recipes
      ORDER BY name
    `)
    .all();

  return Response.json({
    recipes: recipes.results
  });
}

    if (url.pathname.startsWith("/api/recipes/")) {
      const slug = url.pathname.replace("/api/recipes/", "");

      const recipe = await env.DB
        .prepare("SELECT * FROM recipes WHERE slug = ?")
        .bind(slug)
        .first();

      if (!recipe) {
        return Response.json(
          { error: "Recipe not found" },
          { status: 404 }
        );
      }

      const ingredients = await env.DB
        .prepare(`
          SELECT quantity, unit, name, notes, sort_order
          FROM ingredients
          WHERE recipe_id = ?
          ORDER BY sort_order
        `)
        .bind(recipe.id)
        .all();

      const steps = await env.DB
        .prepare(`
          SELECT sort_order, time_offset_minutes, title, instruction, why
          FROM steps
          WHERE recipe_id = ?
          ORDER BY sort_order
        `)
        .bind(recipe.id)
        .all();

      return Response.json({
        ...recipe,
        ingredients: ingredients.results,
        steps: steps.results
      });
    }

    return env.ASSETS.fetch(request);
  },
};
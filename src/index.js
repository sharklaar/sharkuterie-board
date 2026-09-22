export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/recipes/test-recipe") {
      const recipe = await env.DB
        .prepare("SELECT * FROM recipes WHERE slug = ?")
        .bind("test-recipe")
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
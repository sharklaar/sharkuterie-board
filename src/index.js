function makeSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

function getImageType(bytes) {
  const isPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    .every((byte, index) => bytes[index] === byte);

  if (isPng) {
    return { extension: "png", contentType: "image/png" };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }

  const header = String.fromCharCode(...bytes);
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") {
    return { extension: "webp", contentType: "image/webp" };
  }

  if (
    header.slice(4, 8) === "ftyp" &&
    ["avif", "avis"].includes(header.slice(8, 12))
  ) {
    return { extension: "avif", contentType: "image/avif" };
  }

  return null;
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve recipe photos stored in R2
    if (
      url.pathname.startsWith("/media/recipe-images/") &&
      request.method === "GET"
    ) {
      const key = url.pathname.slice("/media/".length);
      if (!/^recipe-images\/[a-f0-9-]+\.(?:jpg|png|webp|avif)$/i.test(key)) {
        return new Response("Image not found", { status: 404 });
      }

      const image = await env.IMAGES.get(key);
      if (!image) {
        return new Response("Image not found", { status: 404 });
      }

      const headers = new Headers();
      image.writeHttpMetadata(headers);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("X-Content-Type-Options", "nosniff");
      if (image.httpEtag) {
        headers.set("ETag", image.httpEtag);
      }

      return new Response(image.body, { headers });
    }

    // Suggest previously used ingredient names
    if (
      url.pathname === "/api/ingredients" &&
      request.method === "GET"
    ) {
      const query = url.searchParams.get("q")?.trim() || "";

      if (query.length < 2) {
        return Response.json({ ingredients: [] });
      }

      const escapedQuery = query.replace(/[!%_]/g, "!$&");
      const ingredients = await env.DB
        .prepare(`
          SELECT DISTINCT TRIM(name) AS name
          FROM ingredients
          WHERE TRIM(name) COLLATE NOCASE LIKE ? ESCAPE '!'
          ORDER BY name COLLATE NOCASE
          LIMIT 10
        `)
        .bind(`${escapedQuery}%`)
        .all();

      return Response.json({
        ingredients: ingredients.results.map(ingredient => ingredient.name)
      });
    }


    // List recipes
    if (
      url.pathname === "/api/recipes" &&
      request.method === "GET"
    ) {
      const recipes = await env.DB
        .prepare(`
          SELECT
            id,
            name,
            slug,
            description,
            serves,
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


    // Get one complete recipe
    if (
      url.pathname.startsWith("/api/recipes/") &&
      request.method === "GET"
    ) {
      const slug = url.pathname.replace(
        "/api/recipes/",
        ""
      );

      const recipe = await env.DB
        .prepare(`
          SELECT
            id,
            name,
            slug,
            description,
            serves,
            total_time_minutes,
            image_path,
            created_at,
            updated_at
          FROM recipes
          WHERE slug = ?
        `)
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
          SELECT
            quantity,
            unit,
            name,
            notes,
            sort_order
          FROM ingredients
          WHERE recipe_id = ?
          ORDER BY sort_order
        `)
        .bind(recipe.id)
        .all();


      const steps = await env.DB
        .prepare(`
          SELECT
            sort_order,
            time_offset_minutes,
            title,
            instruction,
            why
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


    // Create recipe
    if (
      url.pathname === "/api/recipes" &&
      request.method === "POST"
    ) {
      let body;
      let imageFile = null;

      try {
        if (request.headers.get("content-type")?.includes("multipart/form-data")) {
          const contentLength = Number(request.headers.get("content-length") || 0);
          if (contentLength > MAX_IMAGE_SIZE + 512 * 1024) {
            return Response.json(
              { error: "Photo must be 10 MB or smaller" },
              { status: 413 }
            );
          }

          const formData = await request.formData();
          const recipeJson = formData.get("recipe");
          if (typeof recipeJson !== "string") {
            return Response.json(
              { error: "Recipe details are required" },
              { status: 400 }
            );
          }

          body = JSON.parse(recipeJson);
          const uploadedFile = formData.get("image");
          if (uploadedFile instanceof File && uploadedFile.size > 0) {
            imageFile = uploadedFile;
          }
        } else {
          body = await request.json();
        }
      } catch {
        return Response.json(
          { error: "Recipe details could not be read" },
          { status: 400 }
        );
      }

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return Response.json(
          { error: "Recipe details are invalid" },
          { status: 400 }
        );
      }

      const name = typeof body.name === "string" ? body.name.trim() : "";

      if (!name) {
        return Response.json(
          { error: "Recipe name is required" },
          { status: 400 }
        );
      }

      const slug = makeSlug(name);

      let imageKey = null;
      let imagePath = null;
      let imageType = null;

      if (imageFile) {
        if (imageFile.size > MAX_IMAGE_SIZE) {
          return Response.json(
            { error: "Photo must be 10 MB or smaller" },
            { status: 413 }
          );
        }

        const signature = new Uint8Array(
          await imageFile.slice(0, 12).arrayBuffer()
        );
        imageType = getImageType(signature);
        if (!imageType) {
          return Response.json(
            { error: "Use a JPEG, PNG, WebP, or AVIF photo" },
            { status: 415 }
          );
        }

        imageKey = `recipe-images/${crypto.randomUUID()}.${imageType.extension}`;
        imagePath = `/media/${imageKey}`;
      }

      let recipeSaved = false;

      try {
        if (imageFile) {
          await env.IMAGES.put(imageKey, imageFile, {
            httpMetadata: {
              contentType: imageType.contentType,
              cacheControl: "public, max-age=31536000, immutable"
            }
          });
        }

        // Recipe
        const recipe = await env.DB
          .prepare(`
            INSERT INTO recipes (
              name,
              slug,
              description,
              serves,
              total_time_minutes,
              image_path
            )
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING
              id,
              name,
              slug,
              description,
              serves,
              total_time_minutes,
              image_path,
              created_at,
              updated_at
          `)
          .bind(
            name,
            slug,
            body.description || null,
            body.serves || null,
            body.total_time_minutes ?? null,
            imagePath
          )
          .first();

        recipeSaved = Boolean(recipe);

        // Ingredients
        const ingredients = Array.isArray(body.ingredients)
          ? body.ingredients
          : [];

        for (let i = 0; i < ingredients.length; i++) {
          const ingredient = ingredients[i];

          if (!ingredient.name?.trim()) {
            continue;
          }

          await env.DB
            .prepare(`
              INSERT INTO ingredients (
                recipe_id,
                quantity,
                unit,
                name,
                notes,
                sort_order
              )
              VALUES (?, ?, ?, ?, ?, ?)
            `)
            .bind(
              recipe.id,
              ingredient.quantity ?? null,
              ingredient.unit || null,
              ingredient.name.trim(),
              ingredient.notes || null,
              i + 1
            )
            .run();
        }


        // Method steps
        const steps = Array.isArray(body.steps)
          ? body.steps
          : [];

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];

          if (!step.instruction?.trim()) {
            continue;
          }

          await env.DB
            .prepare(`
              INSERT INTO steps (
                recipe_id,
                sort_order,
                time_offset_minutes,
                title,
                instruction,
                why
              )
              VALUES (?, ?, ?, ?, ?, ?)
            `)
            .bind(
              recipe.id,
              i + 1,
              step.time_offset_minutes ?? null,
              step.title || null,
              step.instruction.trim(),
              step.why || null
            )
            .run();
        }


        return Response.json(
          recipe,
          { status: 201 }
        );

      } catch (error) {
        console.error(error);

        if (imageKey && !recipeSaved) {
          try {
            await env.IMAGES.delete(imageKey);
          } catch (cleanupError) {
            console.error(cleanupError);
          }
        }

        return Response.json(
          { error: "Could not create recipe" },
          { status: 500 }
        );
      }
    }


    // Everything else is a static asset
    return env.ASSETS.fetch(request);
  },
};

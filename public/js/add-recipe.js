const form = document.getElementById("recipe-form");
const status = document.getElementById("form-status");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  status.textContent = "Saving...";

  const formData = new FormData(form);

  const heatLevel = formData.get("heat_level");
  const totalTime = formData.get("total_time_minutes");

  const recipe = {
    name: formData.get("name"),
    description: formData.get("description"),
    serves: formData.get("serves"),

    heat_level:
      heatLevel === ""
        ? null
        : Number(heatLevel),

    total_time_minutes:
      totalTime === ""
        ? null
        : Number(totalTime)
  };

  try {
    const response = await fetch("/api/recipes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(recipe)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not save recipe");
    }

    window.location.href = "/";

  } catch (error) {
    console.error(error);
    status.textContent = error.message;
  }
});
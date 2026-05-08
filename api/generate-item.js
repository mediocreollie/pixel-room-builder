import {
  generateFurnitureItem,
  readJsonRequestBody,
} from "./generate-item-service.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({
      error: "Method not allowed. Use POST.",
    });
  }

  const contentType = request.headers["content-type"] || "";

  if (!contentType.includes("application/json")) {
    return response.status(400).json({
      error: "Expected application/json with an imageDataUrl payload.",
    });
  }

  try {
    const payload = await readJsonRequestBody(request);
    const generatedItem = await generateFurnitureItem(payload);

    return response.status(200).json(generatedItem);
  } catch (error) {
    return response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Unable to generate an item image right now.",
    });
  }
}

import {
  generateFurnitureItem,
  readJsonRequestBody,
} from "./generate-item-service.js";

export default async function handler(request, response) {
  console.info("[api/generate-item] route hit", {
    method: request.method,
    generationProvider: process.env.GENERATION_PROVIDER || "comfyui",
    comfyUiBaseUrl: process.env.COMFYUI_BASE_URL || "http://127.0.0.1:8188",
    comfyUiWorkflowPath:
      process.env.COMFYUI_WORKFLOW_PATH ||
      "./api/comfyui-workflows/furniture-txt2img.json",
  });

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
    console.info("[api/generate-item] payload received", {
      payloadKeys: Object.keys(payload || {}),
      hasImageDataUrl:
        typeof payload?.imageDataUrl === "string" &&
        payload.imageDataUrl.startsWith("data:image/"),
      itemId: payload?.itemId,
      itemNumber: payload?.itemNumber,
      objectTypeHint: payload?.objectTypeHint || "",
    });
    const generatedItem = await generateFurnitureItem(payload);

    return response.status(200).json(generatedItem);
  } catch (error) {
    console.error("[api/generate-item] generation failed", error);
    const details = error?.details || {
      provider: process.env.GENERATION_PROVIDER || "comfyui",
      workflowMode: process.env.COMFYUI_WORKFLOW_MODE || "txt2img",
      workflowPath:
        (process.env.COMFYUI_WORKFLOW_MODE || "txt2img") === "img2img"
          ? process.env.COMFYUI_IMG2IMG_WORKFLOW_PATH ||
            "./api/comfyui-workflows/furniture-img2img.json"
          : process.env.COMFYUI_WORKFLOW_PATH ||
            "./api/comfyui-workflows/furniture-txt2img.json",
      fallbackReason: "local fake item flow",
      summary:
        error instanceof Error
          ? error.message
          : "Unable to generate an item image right now.",
      stack: error instanceof Error ? error.stack : null,
    };
    return response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Unable to generate an item image right now.",
      details,
    });
  }
}

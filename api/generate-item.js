import { buildMockGenerateItemResponse } from "./generate-item-response.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({
      error: "Method not allowed. Use POST.",
    });
  }

  const contentType = request.headers["content-type"] || "";

  if (!contentType.includes("multipart/form-data")) {
    return response.status(400).json({
      error: "Expected multipart/form-data with an image upload.",
    });
  }

  const itemId = request.body?.itemId;
  const parsedItemNumber = Number.parseInt(request.body?.itemNumber ?? "1", 10);
  const itemNumber = Number.isNaN(parsedItemNumber) ? 1 : parsedItemNumber;

  return response.status(200).json(
    buildMockGenerateItemResponse({ itemId, itemNumber })
  );
}

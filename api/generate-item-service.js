const DEFAULT_RESPONSE_MODEL = "gpt-5";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_IMAGE_QUALITY = "medium";
const DEFAULT_IMAGE_FORMAT = "png";

function readRequestStream(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    request.on("error", reject);
  });
}

export async function readJsonRequestBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string" && request.body.length > 0) {
    return JSON.parse(request.body);
  }

  const rawBody = await readRequestStream(request);

  if (!rawBody) {
    return {};
  }

  return JSON.parse(rawBody);
}

export function validateGenerateItemPayload(payload) {
  const imageDataUrl = payload?.imageDataUrl;
  const itemId =
    typeof payload?.itemId === "string" && payload.itemId.trim().length > 0
      ? payload.itemId.trim()
      : undefined;
  const parsedItemNumber = Number.parseInt(String(payload?.itemNumber ?? "1"), 10);
  const itemNumber = Number.isNaN(parsedItemNumber) ? 1 : parsedItemNumber;

  if (
    typeof imageDataUrl !== "string" ||
    !imageDataUrl.startsWith("data:image/")
  ) {
    throw new Error("Expected imageDataUrl to be a base64-encoded image data URL.");
  }

  return {
    imageDataUrl,
    itemId,
    itemNumber,
  };
}

function buildPrompt() {
  return [
    "Edit the uploaded furniture photo into one single furniture sprite.",
    "Create a clean isometric pixel-art furniture object.",
    "Use a transparent background.",
    "Do not include any environment, floor, walls, room, cast shadow, text, frame, or extra props.",
    "Keep only the main furniture object.",
    "Use a simple cozy simulation-game style with crisp readable shapes.",
    "Return one isolated furniture asset only.",
  ].join(" ");
}

function extractGeneratedImage(responsePayload) {
  const imageCall = responsePayload?.output?.find?.(
    (outputItem) => outputItem.type === "image_generation_call"
  );

  if (!imageCall?.result) {
    throw new Error("OpenAI response did not include a generated image.");
  }

  return imageCall.result;
}

async function callOpenAiImageGeneration({ imageDataUrl }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the backend.");
  }

  const responseModel =
    process.env.OPENAI_RESPONSE_MODEL || DEFAULT_RESPONSE_MODEL;

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: responseModel,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildPrompt(),
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "high",
            },
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          background: "transparent",
          quality: process.env.OPENAI_IMAGE_QUALITY || DEFAULT_IMAGE_QUALITY,
          size: process.env.OPENAI_IMAGE_SIZE || DEFAULT_IMAGE_SIZE,
          output_format:
            process.env.OPENAI_IMAGE_OUTPUT_FORMAT || DEFAULT_IMAGE_FORMAT,
        },
      ],
      tool_choice: {
        type: "image_generation",
      },
    }),
  });

  const responsePayload = await openAiResponse.json().catch(() => null);

  if (!openAiResponse.ok) {
    const errorMessage =
      responsePayload?.error?.message ||
      responsePayload?.error ||
      "OpenAI image generation request failed.";
    throw new Error(errorMessage);
  }

  return {
    imageBase64: extractGeneratedImage(responsePayload),
    model: responseModel,
  };
}

export async function generateFurnitureItem(payload) {
  const { imageDataUrl, itemId, itemNumber } = validateGenerateItemPayload(payload);
  const { imageBase64, model } = await callOpenAiImageGeneration({
    imageDataUrl,
  });

  return {
    item: {
      id: itemId || `uploaded-item-${Date.now()}`,
      name: `Generated Item ${itemNumber}`,
      width: 1,
      height: 1,
      color: "#38bdf8",
      image: `data:image/png;base64,${imageBase64}`,
    },
    meta: {
      source: "openai-image-generation",
      model,
    },
  };
}

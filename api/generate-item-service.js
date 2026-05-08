const DEFAULT_RESPONSE_MODEL = "gpt-5";
const DEFAULT_DIAGNOSIS_MODEL = "gpt-5";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_IMAGE_QUALITY = "medium";
const DEFAULT_IMAGE_FORMAT = "png";
const ALLOWED_FOOTPRINTS = new Set(["1x1", "2x1", "1x2", "2x2", "3x1"]);

const DEFAULT_DIAGNOSIS = {
  objectType: "furniture",
  displayName: "Generated Item",
  description: "single furniture object",
  footprint: {
    width: 1,
    height: 1,
  },
  anchor: "upright",
  scaleGuidance: "standard upright object, should fit clearly within one tile",
  generationGuidance:
    "preserve the main silhouette, simplify small details, and isolate the object on a transparent background",
};

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

function getApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the backend.");
  }

  return apiKey;
}

function parseJsonObject(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Diagnosis response was empty.");
  }

  const startIndex = text.indexOf("{");
  const endIndex = text.lastIndexOf("}");

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error("Diagnosis response did not contain a JSON object.");
  }

  return JSON.parse(text.slice(startIndex, endIndex + 1));
}

function extractOutputText(responsePayload) {
  if (typeof responsePayload?.output_text === "string" && responsePayload.output_text) {
    return responsePayload.output_text;
  }

  const message = responsePayload?.output?.find?.(
    (outputItem) => outputItem.type === "message"
  );
  const textContent = message?.content?.find?.(
    (contentItem) => contentItem.type === "output_text"
  );

  if (typeof textContent?.text === "string" && textContent.text) {
    return textContent.text;
  }

  throw new Error("OpenAI response did not include diagnosis text.");
}

function normalizeFootprint(footprint) {
  const width = Number.parseInt(String(footprint?.width ?? "1"), 10);
  const height = Number.parseInt(String(footprint?.height ?? "1"), 10);

  if (
    Number.isNaN(width) ||
    Number.isNaN(height) ||
    !ALLOWED_FOOTPRINTS.has(`${width}x${height}`)
  ) {
    return DEFAULT_DIAGNOSIS.footprint;
  }

  return { width, height };
}

function normalizeAnchor(anchor) {
  if (anchor === "surface-center" || anchor === "sprite-floor") {
    return anchor;
  }

  return "upright";
}

function normalizeDiagnosis(rawDiagnosis, itemNumber) {
  const footprint = normalizeFootprint(rawDiagnosis?.footprint);

  return {
    objectType:
      typeof rawDiagnosis?.objectType === "string" && rawDiagnosis.objectType.trim()
        ? rawDiagnosis.objectType.trim().toLowerCase()
        : DEFAULT_DIAGNOSIS.objectType,
    displayName:
      typeof rawDiagnosis?.displayName === "string" && rawDiagnosis.displayName.trim()
        ? rawDiagnosis.displayName.trim()
        : `Generated Item ${itemNumber}`,
    description:
      typeof rawDiagnosis?.description === "string" && rawDiagnosis.description.trim()
        ? rawDiagnosis.description.trim()
        : DEFAULT_DIAGNOSIS.description,
    footprint,
    anchor: normalizeAnchor(rawDiagnosis?.anchor),
    scaleGuidance:
      typeof rawDiagnosis?.scaleGuidance === "string" && rawDiagnosis.scaleGuidance.trim()
        ? rawDiagnosis.scaleGuidance.trim()
        : DEFAULT_DIAGNOSIS.scaleGuidance,
    generationGuidance:
      typeof rawDiagnosis?.generationGuidance === "string" &&
      rawDiagnosis.generationGuidance.trim()
        ? rawDiagnosis.generationGuidance.trim()
        : DEFAULT_DIAGNOSIS.generationGuidance,
  };
}

function buildDiagnosisPrompt() {
  return [
    "Look at the uploaded image and identify the single primary furniture or room object.",
    "Return only one JSON object with no markdown and no extra text.",
    'Allowed footprint choices are exactly: 1x1, 2x1, 1x2, 2x2, 3x1.',
    'Allowed anchor values are exactly: "upright", "surface-center", "sprite-floor".',
    "Choose upright for tall standing objects, surface-center for low floor-hugging furniture, and sprite-floor for larger upright sprite objects.",
    "Use this JSON shape:",
    '{"objectType":"lamp","displayName":"Generated Lamp","description":"small standing lamp with round shade","footprint":{"width":1,"height":1},"anchor":"upright","scaleGuidance":"small upright object, should not fill entire tile","generationGuidance":"preserve lamp shade and thin stand, simplify base"}',
  ].join(" ");
}

function buildGenerationPrompt(diagnosis) {
  return [
    "Edit the uploaded object photo into one single isolated isometric pixel-art furniture sprite.",
    "Use a transparent background.",
    "Do not include any environment, floor, walls, room, cast shadow, text, frame, or extra props.",
    `Object type: ${diagnosis.objectType}.`,
    `Display name: ${diagnosis.displayName}.`,
    `Visible description: ${diagnosis.description}.`,
    `Logical footprint: ${diagnosis.footprint.width}x${diagnosis.footprint.height}.`,
    `Anchor guidance: ${diagnosis.anchor}.`,
    `Scale guidance: ${diagnosis.scaleGuidance}.`,
    `Preserve these key features: ${diagnosis.generationGuidance}.`,
    "Keep only the main object, simplify small details, and make the result readable as a cozy simulation-game asset.",
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

async function postOpenAiJson(body) {
  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  const responsePayload = await openAiResponse.json().catch(() => null);

  if (!openAiResponse.ok) {
    const errorMessage =
      responsePayload?.error?.message ||
      responsePayload?.error ||
      "OpenAI request failed.";
    throw new Error(errorMessage);
  }

  return responsePayload;
}

async function diagnoseFurnitureObject({ imageDataUrl, itemNumber }) {
  const responsePayload = await postOpenAiJson({
    model: process.env.OPENAI_DIAGNOSIS_MODEL || DEFAULT_DIAGNOSIS_MODEL,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildDiagnosisPrompt(),
          },
          {
            type: "input_image",
            image_url: imageDataUrl,
            detail: "high",
          },
        ],
      },
    ],
  });

  const diagnosisText = extractOutputText(responsePayload);
  const parsedDiagnosis = parseJsonObject(diagnosisText);

  return normalizeDiagnosis(parsedDiagnosis, itemNumber);
}

async function callOpenAiImageGeneration({ imageDataUrl, diagnosis }) {
  const responseModel =
    process.env.OPENAI_RESPONSE_MODEL || DEFAULT_RESPONSE_MODEL;

  const responsePayload = await postOpenAiJson({
    model: responseModel,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildGenerationPrompt(diagnosis),
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
  });

  return {
    imageBase64: extractGeneratedImage(responsePayload),
    model: responseModel,
  };
}

export async function generateFurnitureItem(payload) {
  const { imageDataUrl, itemId, itemNumber } = validateGenerateItemPayload(payload);

  let diagnosis = DEFAULT_DIAGNOSIS;
  let diagnosisFallback = false;

  try {
    diagnosis = await diagnoseFurnitureObject({
      imageDataUrl,
      itemNumber,
    });
  } catch (error) {
    diagnosisFallback = true;
    console.warn("Falling back to default diagnosis metadata.", error);
    diagnosis = {
      ...DEFAULT_DIAGNOSIS,
      displayName: `Generated Item ${itemNumber}`,
    };
  }

  const { imageBase64, model } = await callOpenAiImageGeneration({
    imageDataUrl,
    diagnosis,
  });

  return {
    item: {
      id: itemId || `uploaded-item-${Date.now()}`,
      image: `data:image/png;base64,${imageBase64}`,
      color: "#38bdf8",
    },
    diagnosis,
    meta: {
      source: "openai-image-generation",
      model,
      diagnosisFallback,
    },
  };
}

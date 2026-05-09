import { diagnoseWithOpenAi, generateWithOpenAi } from "./providers/openai-generation.js";
import { generateWithComfyUi } from "./providers/comfyui-generation.js";

const ALLOWED_FOOTPRINTS = new Set(["1x1", "2x1", "1x2", "2x2", "3x1"]);
const DEFAULT_PROVIDER = "openai";

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

function getGenerationProvider() {
  return (process.env.GENERATION_PROVIDER || DEFAULT_PROVIDER).toLowerCase();
}

async function diagnoseFurnitureObject({ imageDataUrl, itemNumber }) {
  return diagnoseWithOpenAi({
    imageDataUrl,
    itemNumber,
    diagnosisPrompt: buildDiagnosisPrompt(),
    normalizeDiagnosis,
  });
}

async function generateWithSelectedProvider({ imageDataUrl, diagnosis }) {
  const generationPrompt = buildGenerationPrompt(diagnosis);
  const provider = getGenerationProvider();

  if (provider === "comfyui") {
    try {
      return await generateWithComfyUi({
        imageDataUrl,
        diagnosis,
        generationPrompt,
      });
    } catch (error) {
      if (!process.env.OPENAI_API_KEY) {
        throw error;
      }

      const fallbackResult = await generateWithOpenAi({
        imageDataUrl,
        generationPrompt,
      });

      return {
        ...fallbackResult,
        provider: "openai-fallback",
        fallbackReason: error instanceof Error ? error.message : "ComfyUI failed.",
      };
    }
  }

  return generateWithOpenAi({
    imageDataUrl,
    generationPrompt,
  });
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

  const generationResult = await generateWithSelectedProvider({
    imageDataUrl,
    diagnosis,
  });

  return {
    item: {
      id: itemId || `uploaded-item-${Date.now()}`,
      image: `data:image/png;base64,${generationResult.imageBase64}`,
      color: "#38bdf8",
    },
    diagnosis,
    meta: {
      source: generationResult.provider,
      model: generationResult.model,
      diagnosisFallback,
      fallbackReason: generationResult.fallbackReason,
    },
  };
}

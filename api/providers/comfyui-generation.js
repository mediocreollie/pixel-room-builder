import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_COMFYUI_BASE_URL = "http://127.0.0.1:8188";
const DEFAULT_TXT2IMG_WORKFLOW_PATH = "./api/comfyui-workflows/furniture-txt2img.json";
const DEFAULT_IMG2IMG_WORKFLOW_PATH = "./api/comfyui-workflows/furniture-img2img.json";
const DEFAULT_WORKFLOW_MODE = "txt2img";
const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_NEGATIVE_PROMPT =
  "blurry, low quality, photo, realistic, text, watermark, room background, floor, frame, cropped, duplicate object";
const WORKFLOW_PLACEHOLDER_CHECKPOINT = "PUT_CHECKPOINT_NAME_HERE";
const WHITE_BACKGROUND_THRESHOLD = 242;
const CROPPING_PADDING = 2;
const DEFAULT_DENOISE = 0.45;
const COMFYUI_UPLOAD_FILENAME = "uploaded-furniture-source";

let pngModulePromise = null;

function getComfyUiBaseUrl() {
  return (process.env.COMFYUI_BASE_URL || DEFAULT_COMFYUI_BASE_URL).replace(/\/+$/, "");
}

function getTxt2ImgWorkflowPath() {
  return process.env.COMFYUI_WORKFLOW_PATH || DEFAULT_TXT2IMG_WORKFLOW_PATH;
}

function getImg2ImgWorkflowPath() {
  return process.env.COMFYUI_IMG2IMG_WORKFLOW_PATH || DEFAULT_IMG2IMG_WORKFLOW_PATH;
}

function getWorkflowMode() {
  return (process.env.COMFYUI_WORKFLOW_MODE || DEFAULT_WORKFLOW_MODE).toLowerCase();
}

function getTimeoutMs() {
  return Number.parseInt(
    process.env.COMFYUI_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS),
    10
  );
}

function getPollIntervalMs() {
  return Number.parseInt(
    process.env.COMFYUI_POLL_INTERVAL_MS || String(DEFAULT_POLL_INTERVAL_MS),
    10
  );
}

function getCheckpointName() {
  return process.env.COMFYUI_CHECKPOINT_NAME || WORKFLOW_PLACEHOLDER_CHECKPOINT;
}

function getDenoiseValue() {
  const parsed = Number.parseFloat(process.env.COMFYUI_DENOISE || String(DEFAULT_DENOISE));

  if (Number.isNaN(parsed)) {
    return DEFAULT_DENOISE;
  }

  return Math.min(1, Math.max(0, parsed));
}

function createComfyUiError(message, details = {}, cause) {
  const error = new Error(message);
  error.details = {
    provider: "comfyui",
    workflowMode: details.workflowMode || getWorkflowMode(),
    workflowPath: details.workflowPath || null,
    fallbackReason: details.fallbackReason || "local fake item flow",
    summary: message,
    ...details,
  };

  if (cause instanceof Error) {
    error.cause = cause;
    error.details.stack = cause.stack;
  }

  return error;
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function loadPngModule() {
  if (!pngModulePromise) {
    pngModulePromise = import("pngjs")
      .then((module) => module.PNG || module.default?.PNG || module.default)
      .catch((error) => {
        console.warn("[comfyui] png cleanup disabled", {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
  }

  return pngModulePromise;
}

async function readWorkflowFile(workflowPathValue) {
  const workflowPath = path.resolve(process.cwd(), workflowPathValue);

  try {
    const workflowContents = await fs.readFile(workflowPath, "utf8");
    const parsedWorkflow = JSON.parse(workflowContents);

    console.info("[comfyui] workflow loaded successfully", {
      workflowPath,
      topLevelKeys: Object.keys(parsedWorkflow || {}),
    });

    return {
      workflowPath,
      workflow: parsedWorkflow,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw createComfyUiError(`ComfyUI workflow file is missing: ${workflowPath}`, {
        workflowPath,
      });
    }

    throw createComfyUiError(`Could not read ComfyUI workflow file: ${workflowPath}`, {
      workflowPath,
    }, error instanceof Error ? error : undefined);
  }
}

function buildNegativePrompt() {
  return process.env.COMFYUI_NEGATIVE_PROMPT || DEFAULT_NEGATIVE_PROMPT;
}

function buildPositivePrompt(generationPrompt) {
  return [
    generationPrompt,
    "Cozy simulation game asset.",
    "Transparent background.",
    "Single isolated object only.",
    "Preserve the main silhouette from the uploaded reference image.",
  ].join(" ");
}

function randomSeed() {
  return Math.floor(Math.random() * 2147483647);
}

async function postJson(url, body, errorPrefix, details = {}) {
  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw createComfyUiError("ComfyUI is not running or is not reachable.", details, error);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw createComfyUiError(
      payload?.error?.message || payload?.error || errorPrefix,
      details
    );
  }

  return payload;
}

async function checkComfyUiHealth() {
  const baseUrl = getComfyUiBaseUrl();
  const healthUrls = [`${baseUrl}/system_stats`, baseUrl];

  for (const url of healthUrls) {
    try {
      const response = await fetch(url);
      console.info("[comfyui] health check", {
        url,
        ok: response.ok,
        status: response.status,
      });

      if (response.ok) {
        return true;
      }
    } catch (error) {
      console.warn("[comfyui] health check failed", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw createComfyUiError(`ComfyUI is not reachable at ${baseUrl}`, {
    workflowMode: getWorkflowMode(),
  });
}

async function getJson(url, errorPrefix, details = {}) {
  let response;

  try {
    response = await fetch(url);
  } catch (error) {
    throw createComfyUiError("ComfyUI is not running or is not reachable.", details, error);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw createComfyUiError(
      payload?.error?.message || payload?.error || errorPrefix,
      details
    );
  }

  return payload;
}

function parseDataUrl(imageDataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageDataUrl);

  if (!match) {
    throw createComfyUiError("Expected a base64 image data URL for ComfyUI upload.");
  }

  const mimeType = match[1];
  const base64Payload = match[2];
  const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";

  return {
    mimeType,
    extension,
    buffer: Buffer.from(base64Payload, "base64"),
  };
}

async function uploadSourceImageToComfyUi(imageDataUrl) {
  const { mimeType, extension, buffer } = parseDataUrl(imageDataUrl);
  const baseUrl = getComfyUiBaseUrl();
  const formData = new FormData();
  const filename = `${COMFYUI_UPLOAD_FILENAME}.${extension}`;

  console.info("[comfyui] upload/image request start", {
    baseUrl,
    filename,
    mimeType,
  });

  formData.append(
    "image",
    new Blob([buffer], {
      type: mimeType,
    }),
    filename
  );
  formData.append("type", "input");
  formData.append("overwrite", "true");

  let response;

  try {
    response = await fetch(`${baseUrl}/upload/image`, {
      method: "POST",
      body: formData,
    });
  } catch (error) {
    throw createComfyUiError(
      "ComfyUI source image upload failed because the server is unreachable.",
      {
        workflowMode: "img2img",
      },
      error
    );
  }

  const payload = await response.json().catch(() => null);

  console.info("[comfyui] upload/image response", {
    ok: response.ok,
    status: response.status,
    payload,
  });

  if (!response.ok) {
    throw createComfyUiError(
      payload?.error?.message || payload?.error || "ComfyUI source image upload failed.",
      {
        workflowMode: "img2img",
      }
    );
  }

  const uploadedName = payload?.name || payload?.filename || filename;
  const uploadedSubfolder = payload?.subfolder || "";
  const uploadedType = payload?.type || "input";

  console.info("[comfyui] uploaded filename", {
    uploadedName,
    uploadedSubfolder,
    uploadedType,
  });

  return {
    name: uploadedName,
    subfolder: uploadedSubfolder,
    type: uploadedType,
  };
}

function findOutputImage(historyPayload, promptId) {
  const promptHistory = historyPayload?.[promptId];
  const outputs = promptHistory?.outputs;

  if (!outputs || typeof outputs !== "object") {
    return null;
  }

  for (const [outputNodeId, outputNode] of Object.entries(outputs)) {
    const image = outputNode?.images?.[0];

    if (image?.filename) {
      return {
        outputNodeId,
        image,
      };
    }
  }

  return null;
}

async function fetchGeneratedImageAsBase64(imageInfo, workflowMode) {
  const baseUrl = getComfyUiBaseUrl();
  const params = new URLSearchParams({
    filename: imageInfo.image.filename,
    subfolder: imageInfo.image.subfolder || "",
    type: imageInfo.image.type || "output",
  });

  console.info("[comfyui] final image fetch", {
    workflowMode,
    outputNodeId: imageInfo.outputNodeId,
    filename: imageInfo.image.filename,
    subfolder: imageInfo.image.subfolder || "",
    type: imageInfo.image.type || "output",
  });

  let response;

  try {
    response = await fetch(`${baseUrl}/view?${params.toString()}`);
  } catch (error) {
    throw createComfyUiError(
      "ComfyUI generated an image, but it could not be fetched.",
      {
        workflowMode,
      },
      error
    );
  }

  if (!response.ok) {
    throw createComfyUiError(
      "ComfyUI generated an image, but /view did not return it.",
      {
        workflowMode,
      }
    );
  }

  const contentType = response.headers.get("content-type") || "unknown";
  const imageBuffer = Buffer.from(await response.arrayBuffer());
  const processedImage = await processComfyUiImage(imageBuffer, contentType);

  console.info("[comfyui] image diagnostics", {
    workflowMode,
    mimeType: contentType,
    hadAlpha: processedImage.hadAlpha,
    hasAlphaAfterCleanup: processedImage.hasAlphaAfterCleanup,
    originalWidth: processedImage.originalWidth,
    originalHeight: processedImage.originalHeight,
    croppedWidth: processedImage.croppedWidth,
    croppedHeight: processedImage.croppedHeight,
  });

  return {
    imageBase64: processedImage.buffer.toString("base64"),
    mimeType: contentType,
    diagnostics: {
      mimeType: contentType,
      hadAlpha: processedImage.hadAlpha,
      hasAlphaAfterCleanup: processedImage.hasAlphaAfterCleanup,
      originalWidth: processedImage.originalWidth,
      originalHeight: processedImage.originalHeight,
      croppedWidth: processedImage.croppedWidth,
      croppedHeight: processedImage.croppedHeight,
      outputNodeId: imageInfo.outputNodeId,
    },
  };
}

function hasAlphaChannel(png) {
  for (let index = 3; index < png.data.length; index += 4) {
    if (png.data[index] < 250) {
      return true;
    }
  }

  return false;
}

function isNearWhitePixel(png, x, y) {
  const pixelIndex = (png.width * y + x) * 4;
  const red = png.data[pixelIndex];
  const green = png.data[pixelIndex + 1];
  const blue = png.data[pixelIndex + 2];
  const alpha = png.data[pixelIndex + 3];

  return (
    alpha > 245 &&
    red >= WHITE_BACKGROUND_THRESHOLD &&
    green >= WHITE_BACKGROUND_THRESHOLD &&
    blue >= WHITE_BACKGROUND_THRESHOLD
  );
}

function removeBorderConnectedWhiteBackground(png) {
  const visited = new Uint8Array(png.width * png.height);
  const queue = [];

  function visit(x, y) {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
      return;
    }

    const visitIndex = y * png.width + x;

    if (visited[visitIndex] === 1 || !isNearWhitePixel(png, x, y)) {
      return;
    }

    visited[visitIndex] = 1;
    queue.push([x, y]);
  }

  for (let x = 0; x < png.width; x += 1) {
    visit(x, 0);
    visit(x, png.height - 1);
  }

  for (let y = 0; y < png.height; y += 1) {
    visit(0, y);
    visit(png.width - 1, y);
  }

  while (queue.length > 0) {
    const [x, y] = queue.shift();
    const pixelIndex = (png.width * y + x) * 4;
    png.data[pixelIndex + 3] = 0;

    visit(x + 1, y);
    visit(x - 1, y);
    visit(x, y + 1);
    visit(x, y - 1);
  }
}

function cropTransparentBounds(PNG, png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const pixelIndex = (png.width * y + x) * 4;
      const alpha = png.data[pixelIndex + 3];

      if (alpha === 0) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX === -1 || maxY === -1) {
    return png;
  }

  minX = Math.max(0, minX - CROPPING_PADDING);
  minY = Math.max(0, minY - CROPPING_PADDING);
  maxX = Math.min(png.width - 1, maxX + CROPPING_PADDING);
  maxY = Math.min(png.height - 1, maxY + CROPPING_PADDING);

  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;
  const cropped = new PNG({ width: croppedWidth, height: croppedHeight });

  PNG.bitblt(
    png,
    cropped,
    minX,
    minY,
    croppedWidth,
    croppedHeight,
    0,
    0
  );

  return cropped;
}

async function processComfyUiImage(imageBuffer, mimeType) {
  if (!mimeType.includes("png")) {
    return {
      buffer: imageBuffer,
      hadAlpha: false,
      hasAlphaAfterCleanup: false,
      originalWidth: 0,
      originalHeight: 0,
      croppedWidth: 0,
      croppedHeight: 0,
    };
  }

  const PNG = await loadPngModule();

  if (!PNG) {
    return {
      buffer: imageBuffer,
      hadAlpha: false,
      hasAlphaAfterCleanup: false,
      originalWidth: 0,
      originalHeight: 0,
      croppedWidth: 0,
      croppedHeight: 0,
    };
  }

  const parsed = PNG.sync.read(imageBuffer);
  const hadAlpha = hasAlphaChannel(parsed);

  if (!hadAlpha) {
    removeBorderConnectedWhiteBackground(parsed);
  }

  const cropped = cropTransparentBounds(PNG, parsed);
  const hasAlphaAfterCleanup = hasAlphaChannel(cropped);
  const encoded = PNG.sync.write(cropped);

  return {
    buffer: encoded,
    hadAlpha,
    hasAlphaAfterCleanup,
    originalWidth: parsed.width,
    originalHeight: parsed.height,
    croppedWidth: cropped.width,
    croppedHeight: cropped.height,
  };
}

function findNodeIdByMatcher(workflow, matcher) {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (matcher(node)) {
      return nodeId;
    }
  }

  return null;
}

function findTextNodeIds(workflow) {
  const clipNodes = Object.entries(workflow).filter(([, node]) => node?.class_type === "CLIPTextEncode");
  const positiveNodeId =
    findNodeIdByMatcher(
      workflow,
      (node) =>
        node?.class_type === "CLIPTextEncode" &&
        typeof node._meta?.title === "string" &&
        node._meta.title.toLowerCase().includes("positive")
    ) ||
    clipNodes[0]?.[0] ||
    null;
  const negativeNodeId =
    findNodeIdByMatcher(
      workflow,
      (node) =>
        node?.class_type === "CLIPTextEncode" &&
        typeof node._meta?.title === "string" &&
        node._meta.title.toLowerCase().includes("negative")
    ) ||
    clipNodes[1]?.[0] ||
    null;

  return {
    positiveNodeId,
    negativeNodeId,
  };
}

function applyTextToNodeById(workflow, nodeId, textValue) {
  if (!nodeId || !workflow[nodeId]) {
    return false;
  }

  workflow[nodeId].inputs = {
    ...(workflow[nodeId].inputs || {}),
    text: textValue,
  };

  return true;
}

function applyCheckpoint(workflow, checkpointName) {
  for (const node of Object.values(workflow)) {
    if (node?.class_type === "CheckpointLoaderSimple") {
      node.inputs = {
        ...(node.inputs || {}),
        ckpt_name: checkpointName,
      };
      return true;
    }
  }

  return false;
}

function applySeed(workflow, seed) {
  for (const node of Object.values(workflow)) {
    if (node?.class_type === "KSampler") {
      node.inputs = {
        ...(node.inputs || {}),
        seed,
      };
      return true;
    }
  }

  return false;
}

function applySavePrefix(workflow, prefix) {
  for (const node of Object.values(workflow)) {
    if (node?.class_type === "SaveImage") {
      node.inputs = {
        ...(node.inputs || {}),
        filename_prefix: prefix,
      };
      return true;
    }
  }

  return false;
}

function applyDenoise(workflow, denoiseValue) {
  for (const node of Object.values(workflow)) {
    if (node?.class_type === "KSampler") {
      node.inputs = {
        ...(node.inputs || {}),
        denoise: denoiseValue,
      };
      return true;
    }
  }

  return false;
}

function applyLoadImage(workflow, uploadedImage) {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node?.class_type === "LoadImage") {
      node.inputs = {
        ...(node.inputs || {}),
        image: uploadedImage.name,
      };
      return nodeId;
    }
  }

  return null;
}

async function waitForPromptCompletion(promptId, workflowMode) {
  const startedAt = Date.now();
  const timeoutMs = getTimeoutMs();
  const pollIntervalMs = getPollIntervalMs();
  const baseUrl = getComfyUiBaseUrl();

  console.info("[comfyui] polling start", {
    promptId,
    workflowMode,
    pollIntervalMs,
    timeoutMs,
  });

  while (Date.now() - startedAt < timeoutMs) {
    const historyPayload = await getJson(
      `${baseUrl}/history/${promptId}`,
      "ComfyUI history request failed.",
      {
        workflowMode,
      }
    );
    const imageInfo = findOutputImage(historyPayload, promptId);

    if (imageInfo) {
      console.info("[comfyui] polling completion", {
        promptId,
        workflowMode,
        outputNodeId: imageInfo.outputNodeId,
        filename: imageInfo.image.filename,
      });
      return imageInfo;
    }

    await sleep(pollIntervalMs);
  }

  throw createComfyUiError("Timed out waiting for ComfyUI to finish generation.", {
    workflowMode,
  });
}

function validateApiWorkflow(workflow, workflowPath, workflowMode) {
  if (workflow?.nodes && Array.isArray(workflow.nodes)) {
    throw createComfyUiError("ComfyUI workflow must be exported in API format", {
      workflowMode,
      workflowPath,
    });
  }

  if (!workflow || Array.isArray(workflow) || typeof workflow !== "object") {
    throw createComfyUiError("ComfyUI workflow file is not a valid API-format workflow object.", {
      workflowMode,
      workflowPath,
    });
  }
}

function prepareWorkflow(workflow, workflowPath, generationPrompt, options = {}) {
  const workflowMode = options.mode || "txt2img";
  validateApiWorkflow(workflow, workflowPath, workflowMode);

  const checkpointName = getCheckpointName();

  if (checkpointName === WORKFLOW_PLACEHOLDER_CHECKPOINT) {
    throw createComfyUiError(
      "COMFYUI_CHECKPOINT_NAME is required for the starter ComfyUI workflows.",
      {
        workflowMode,
        workflowPath,
      }
    );
  }

  const { positiveNodeId, negativeNodeId } = findTextNodeIds(workflow);
  const positiveApplied = applyTextToNodeById(
    workflow,
    positiveNodeId,
    buildPositivePrompt(generationPrompt)
  );
  const negativeApplied = applyTextToNodeById(
    workflow,
    negativeNodeId,
    buildNegativePrompt()
  );
  const checkpointApplied = applyCheckpoint(workflow, checkpointName);
  const checkpointNodeId = findNodeIdByMatcher(
    workflow,
    (node) => node?.class_type === "CheckpointLoaderSimple"
  );
  const nodeCount = Object.keys(workflow).length;

  applySeed(workflow, randomSeed());
  applySavePrefix(workflow, `furniture-${Date.now()}`);

  let loadImageNodeId = null;

  if (workflowMode === "img2img") {
    loadImageNodeId = applyLoadImage(workflow, options.uploadedImage);
    const denoiseApplied = applyDenoise(workflow, getDenoiseValue());

    console.info("[comfyui] detected LoadImage node id", {
      loadImageNodeId,
    });

    if (!loadImageNodeId) {
      throw createComfyUiError("ComfyUI img2img workflow is missing a LoadImage node.", {
        workflowMode,
        workflowPath,
      });
    }

    if (!denoiseApplied) {
      throw createComfyUiError(
        "ComfyUI img2img workflow is missing a KSampler node for denoise injection.",
        {
          workflowMode,
          workflowPath,
        }
      );
    }
  }

  console.info("[comfyui] prompt node ids", {
    workflowMode,
    positiveNodeId,
    negativeNodeId,
    checkpointNodeId,
    loadImageNodeId,
    nodeCount,
  });

  if (!positiveApplied || !negativeApplied) {
    throw createComfyUiError(
      "ComfyUI workflow is missing Positive/Negative Prompt CLIPTextEncode nodes.",
      {
        workflowMode,
        workflowPath,
      }
    );
  }

  if (!checkpointApplied) {
    throw createComfyUiError(
      "ComfyUI workflow is missing a CheckpointLoaderSimple node for checkpoint injection.",
      {
        workflowMode,
        workflowPath,
      }
    );
  }

  return workflow;
}

async function queueWorkflow({ workflow, workflowPath, workflowMode }) {
  const baseUrl = getComfyUiBaseUrl();

  console.info("[comfyui] /prompt request payload summary", {
    workflowMode,
    workflowPath,
    nodeCount: Object.keys(workflow).length,
    nodeIds: Object.keys(workflow),
  });

  const promptPayload = await postJson(
    `${baseUrl}/prompt`,
    {
      prompt: workflow,
    },
    "ComfyUI prompt queue failed.",
    {
      workflowMode,
      workflowPath,
    }
  );

  console.info("[comfyui] /prompt response", promptPayload);

  const promptId = promptPayload?.prompt_id;

  if (!promptId) {
    throw createComfyUiError("ComfyUI did not return a prompt_id.", {
      workflowMode,
      workflowPath,
    });
  }

  const imageInfo = await waitForPromptCompletion(promptId, workflowMode);
  return fetchGeneratedImageAsBase64(imageInfo, workflowMode);
}

async function runTxt2ImgWorkflow(generationPrompt) {
  const { workflowPath, workflow: parsedWorkflow } = await readWorkflowFile(getTxt2ImgWorkflowPath());
  const workflowMode = "txt2img";
  const workflow = prepareWorkflow(parsedWorkflow, workflowPath, generationPrompt, {
    mode: workflowMode,
  });
  const result = await queueWorkflow({
    workflow,
    workflowPath,
    workflowMode,
  });

  return {
    ...result,
    provider: "comfyui",
    model: "local-comfyui-txt2img",
    workflowMode,
    workflowPath,
  };
}

async function runImg2ImgWorkflow({ imageDataUrl, generationPrompt }) {
  const workflowMode = "img2img";
  const uploadedImage = await uploadSourceImageToComfyUi(imageDataUrl);
  const { workflowPath, workflow: parsedWorkflow } = await readWorkflowFile(getImg2ImgWorkflowPath());
  const workflow = prepareWorkflow(parsedWorkflow, workflowPath, generationPrompt, {
    mode: workflowMode,
    uploadedImage,
  });
  const result = await queueWorkflow({
    workflow,
    workflowPath,
    workflowMode,
  });

  return {
    ...result,
    provider: "comfyui",
    model: "local-comfyui-img2img",
    workflowMode,
    workflowPath,
  };
}

export async function generateWithComfyUi({
  generationPrompt,
  imageDataUrl,
}) {
  const workflowMode = getWorkflowMode();

  console.info("[comfyui] selected workflow mode", {
    workflowMode,
    txt2imgWorkflowPath: getTxt2ImgWorkflowPath(),
    img2imgWorkflowPath: getImg2ImgWorkflowPath(),
  });

  try {
    await checkComfyUiHealth();

    if (workflowMode === "img2img") {
      try {
        return await runImg2ImgWorkflow({
          imageDataUrl,
          generationPrompt,
        });
      } catch (error) {
        console.warn("[comfyui] img2img failed, falling back to txt2img", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : null,
        });

        const txt2ImgResult = await runTxt2ImgWorkflow(generationPrompt);

        return {
          ...txt2ImgResult,
          provider: "comfyui-txt2img-fallback",
          fallbackReason: error instanceof Error ? error.message : "ComfyUI img2img failed.",
        };
      }
    }

    return await runTxt2ImgWorkflow(generationPrompt);
  } catch (error) {
    console.error("[comfyui] generation failure", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
      details: error?.details || null,
    });

    if (error?.details) {
      throw error;
    }

    throw createComfyUiError(
      error instanceof Error ? error.message : "ComfyUI generation failed.",
      {
        workflowMode,
        workflowPath:
          workflowMode === "img2img" ? getImg2ImgWorkflowPath() : getTxt2ImgWorkflowPath(),
      },
      error instanceof Error ? error : undefined
    );
  }
}

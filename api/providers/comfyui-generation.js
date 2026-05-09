import fs from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

const DEFAULT_COMFYUI_BASE_URL = "http://127.0.0.1:8188";
const DEFAULT_WORKFLOW_PATH = "./api/comfyui-workflows/furniture-txt2img.json";
const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_NEGATIVE_PROMPT =
  "blurry, low quality, photo, realistic, text, watermark, room background, floor, frame, cropped, duplicate object";
const WORKFLOW_PLACEHOLDER_CHECKPOINT = "PUT_CHECKPOINT_NAME_HERE";
const WHITE_BACKGROUND_THRESHOLD = 242;
const CROPPING_PADDING = 2;

function getComfyUiBaseUrl() {
  return (process.env.COMFYUI_BASE_URL || DEFAULT_COMFYUI_BASE_URL).replace(/\/+$/, "");
}

function getWorkflowPath() {
  return process.env.COMFYUI_WORKFLOW_PATH || DEFAULT_WORKFLOW_PATH;
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

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function readWorkflowFile() {
  const workflowPath = path.resolve(process.cwd(), getWorkflowPath());

  try {
    const workflowContents = await fs.readFile(workflowPath, "utf8");
    const parsedWorkflow = JSON.parse(workflowContents);

    console.info("[comfyui] workflow file loaded", {
      workflowPath,
      topLevelKeys: Object.keys(parsedWorkflow || {}),
    });

    return {
      workflowPath,
      workflow: parsedWorkflow,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`ComfyUI workflow file is missing: ${workflowPath}`);
    }

    throw new Error(`Could not read ComfyUI workflow file: ${workflowPath}`);
  }
}

function applyTextToNodeByTitle(workflow, titleIncludes, textValue) {
  for (const node of Object.values(workflow)) {
    if (
      node &&
      node.class_type === "CLIPTextEncode" &&
      typeof node._meta?.title === "string" &&
      node._meta.title.toLowerCase().includes(titleIncludes)
    ) {
      node.inputs = {
        ...(node.inputs || {}),
        text: textValue,
      };
      return true;
    }
  }

  return false;
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

function buildNegativePrompt() {
  return process.env.COMFYUI_NEGATIVE_PROMPT || DEFAULT_NEGATIVE_PROMPT;
}

function buildPositivePrompt(generationPrompt) {
  return [
    generationPrompt,
    "Cozy simulation game asset.",
    "Transparent background.",
    "Single isolated object only.",
  ].join(" ");
}

function randomSeed() {
  return Math.floor(Math.random() * 2147483647);
}

async function postJson(url, body, errorPrefix) {
  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("ComfyUI is not running or is not reachable.");
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || errorPrefix);
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

  throw new Error(`ComfyUI is not reachable at ${baseUrl}`);
}

async function getJson(url, errorPrefix) {
  let response;

  try {
    response = await fetch(url);
  } catch {
    throw new Error("ComfyUI is not running or is not reachable.");
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || errorPrefix);
  }

  return payload;
}

function findOutputImage(historyPayload, promptId) {
  const promptHistory = historyPayload?.[promptId];
  const outputs = promptHistory?.outputs;

  if (!outputs || typeof outputs !== "object") {
    return null;
  }

  for (const outputNode of Object.values(outputs)) {
    const image = outputNode?.images?.[0];

    if (image?.filename) {
      return image;
    }
  }

  return null;
}

async function fetchGeneratedImageAsBase64(imageInfo) {
  const baseUrl = getComfyUiBaseUrl();
  const params = new URLSearchParams({
    filename: imageInfo.filename,
    subfolder: imageInfo.subfolder || "",
    type: imageInfo.type || "output",
  });

  let response;

  try {
    response = await fetch(`${baseUrl}/view?${params.toString()}`);
  } catch {
    throw new Error("ComfyUI generated an image, but it could not be fetched.");
  }

  if (!response.ok) {
    throw new Error("ComfyUI generated an image, but /view did not return it.");
  }

  const contentType = response.headers.get("content-type") || "unknown";
  const imageBuffer = Buffer.from(await response.arrayBuffer());
  const processedImage = processComfyUiImage(imageBuffer, contentType);

  console.info("[comfyui] image diagnostics", {
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

function cropTransparentBounds(png) {
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

function processComfyUiImage(imageBuffer, mimeType) {
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

  const parsed = PNG.sync.read(imageBuffer);
  const hadAlpha = hasAlphaChannel(parsed);

  if (!hadAlpha) {
    removeBorderConnectedWhiteBackground(parsed);
  }

  const cropped = cropTransparentBounds(parsed);
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

async function waitForPromptCompletion(promptId) {
  const startedAt = Date.now();
  const timeoutMs = getTimeoutMs();
  const pollIntervalMs = getPollIntervalMs();
  const baseUrl = getComfyUiBaseUrl();

  while (Date.now() - startedAt < timeoutMs) {
    const historyPayload = await getJson(
      `${baseUrl}/history/${promptId}`,
      "ComfyUI history request failed."
    );
    const imageInfo = findOutputImage(historyPayload, promptId);

    if (imageInfo) {
      return imageInfo;
    }

    await sleep(pollIntervalMs);
  }

  throw new Error("Timed out waiting for ComfyUI to finish generation.");
}

function prepareWorkflow(workflow, generationPrompt) {
  if (workflow?.nodes && Array.isArray(workflow.nodes)) {
    throw new Error("ComfyUI workflow must be exported in API format");
  }

  if (!workflow || Array.isArray(workflow) || typeof workflow !== "object") {
    throw new Error("ComfyUI workflow file is not a valid API-format workflow object.");
  }

  const checkpointName = getCheckpointName();

  if (checkpointName === WORKFLOW_PLACEHOLDER_CHECKPOINT) {
    throw new Error(
      "COMFYUI_CHECKPOINT_NAME is required for the starter txt2img workflow."
    );
  }

  const positiveApplied = applyTextToNodeByTitle(
    workflow,
    "positive",
    buildPositivePrompt(generationPrompt)
  );
  const negativeApplied = applyTextToNodeByTitle(
    workflow,
    "negative",
    buildNegativePrompt()
  );
  const checkpointApplied = applyCheckpoint(workflow, checkpointName);
  const positiveNodeId = findNodeIdByMatcher(
    workflow,
    (node) =>
      node &&
      node.class_type === "CLIPTextEncode" &&
      typeof node._meta?.title === "string" &&
      node._meta.title.toLowerCase().includes("positive")
  );
  const negativeNodeId = findNodeIdByMatcher(
    workflow,
    (node) =>
      node &&
      node.class_type === "CLIPTextEncode" &&
      typeof node._meta?.title === "string" &&
      node._meta.title.toLowerCase().includes("negative")
  );
  const checkpointNodeId = findNodeIdByMatcher(
    workflow,
    (node) => node?.class_type === "CheckpointLoaderSimple"
  );
  const nodeCount = Object.keys(workflow).length;

  applySeed(workflow, randomSeed());
  applySavePrefix(workflow, `furniture-${Date.now()}`);

  console.info("[comfyui] workflow patched", {
    nodeCount,
    positiveNodeId,
    negativeNodeId,
    checkpointNodeId,
  });

  if (!positiveApplied || !negativeApplied) {
    throw new Error(
      "ComfyUI workflow is missing Positive/Negative Prompt CLIPTextEncode nodes."
    );
  }

  if (!checkpointApplied) {
    throw new Error(
      "ComfyUI workflow is missing a CheckpointLoaderSimple node for checkpoint injection."
    );
  }

  return workflow;
}

export async function generateWithComfyUi({
  generationPrompt,
  // TODO: support image-to-image by uploading imageDataUrl and injecting it into a
  // LoadImage + VAEEncode workflow once the local img2img graph is finalized.
  imageDataUrl: _imageDataUrl,
}) {
  const baseUrl = getComfyUiBaseUrl();
  await checkComfyUiHealth();
  const { workflowPath, workflow: parsedWorkflow } = await readWorkflowFile();
  const workflow = prepareWorkflow(parsedWorkflow, generationPrompt);
  console.info("[comfyui] starting prompt queue request", {
    baseUrl,
    workflowPath,
  });
  let promptPayload;

  try {
    promptPayload = await postJson(
      `${baseUrl}/prompt`,
      {
        prompt: workflow,
      },
      "ComfyUI prompt queue failed."
    );
    console.info("[comfyui] /prompt response", promptPayload);
  } catch (error) {
    console.error("[comfyui] /prompt failed", error);
    throw error;
  }

  const promptId = promptPayload?.prompt_id;

  if (!promptId) {
    throw new Error("ComfyUI did not return a prompt_id.");
  }

  console.info("[comfyui] prompt queued", {
    promptId,
  });

  const imageInfo = await waitForPromptCompletion(promptId);
  const { imageBase64, mimeType, diagnostics } = await fetchGeneratedImageAsBase64(imageInfo);

  return {
    imageBase64,
    provider: "comfyui",
    model: "local-comfyui-txt2img",
    mimeType,
    diagnostics,
  };
}

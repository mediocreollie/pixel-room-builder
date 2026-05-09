import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_COMFYUI_BASE_URL = "http://127.0.0.1:8188";
const DEFAULT_WORKFLOW_PATH = "./api/comfyui-workflows/furniture-txt2img.json";
const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_NEGATIVE_PROMPT =
  "blurry, low quality, photo, realistic, text, watermark, room background, floor, frame, cropped, duplicate object";
const WORKFLOW_PLACEHOLDER_CHECKPOINT = "PUT_CHECKPOINT_NAME_HERE";

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
    return JSON.parse(workflowContents);
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

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  return imageBuffer.toString("base64");
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

  applySeed(workflow, randomSeed());
  applySavePrefix(workflow, `furniture-${Date.now()}`);

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
  const workflow = prepareWorkflow(await readWorkflowFile(), generationPrompt);
  const promptPayload = await postJson(
    `${baseUrl}/prompt`,
    {
      prompt: workflow,
    },
    "ComfyUI prompt queue failed."
  );

  const promptId = promptPayload?.prompt_id;

  if (!promptId) {
    throw new Error("ComfyUI did not return a prompt_id.");
  }

  const imageInfo = await waitForPromptCompletion(promptId);
  const imageBase64 = await fetchGeneratedImageAsBase64(imageInfo);

  return {
    imageBase64,
    provider: "comfyui",
    model: "local-comfyui-txt2img",
  };
}

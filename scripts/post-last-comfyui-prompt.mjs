import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const promptPath = path.resolve(repoRoot, "api/debug-last-comfyui-prompt.json");
const baseUrl = (process.env.COMFYUI_BASE_URL || "http://127.0.0.1:8188").replace(/\/+$/, "");

const savedPrompt = JSON.parse(await fs.readFile(promptPath, "utf8"));
const response = await fetch(`${baseUrl}/prompt`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    prompt: savedPrompt.prompt,
  }),
});

const payload = await response.json().catch(() => null);

console.log(
  JSON.stringify(
    {
      ok: response.ok,
      status: response.status,
      workflowMode: savedPrompt.workflowMode,
      workflowPath: savedPrompt.workflowPath,
      payload,
    },
    null,
    2
  )
);

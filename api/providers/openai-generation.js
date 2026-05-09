const DEFAULT_RESPONSE_MODEL = "gpt-5";
const DEFAULT_DIAGNOSIS_MODEL = "gpt-5";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_IMAGE_QUALITY = "medium";
const DEFAULT_IMAGE_FORMAT = "png";

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

export async function diagnoseWithOpenAi({
  imageDataUrl,
  itemNumber,
  diagnosisPrompt,
  normalizeDiagnosis,
}) {
  const responsePayload = await postOpenAiJson({
    model: process.env.OPENAI_DIAGNOSIS_MODEL || DEFAULT_DIAGNOSIS_MODEL,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: diagnosisPrompt,
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

export async function generateWithOpenAi({ imageDataUrl, generationPrompt }) {
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
            text: generationPrompt,
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
    provider: "openai",
    model: responseModel,
  };
}

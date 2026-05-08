const REAL_GENERATION_ENABLED =
  import.meta.env.VITE_ENABLE_REAL_GENERATION === "true";

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

export function isRealGenerationEnabled() {
  return REAL_GENERATION_ENABLED;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not read the uploaded image."));
    };

    reader.onerror = () => {
      reject(reader.error || new Error("Could not read the uploaded image."));
    };

    reader.readAsDataURL(file);
  });
}

export async function createFakeGeneratedItem({ file, itemId, itemNumber }) {
  await wait(1200);

  return {
    id: itemId,
    name: `Uploaded Item ${itemNumber}`,
    width: 1,
    height: 1,
    color: "#38bdf8",
    image: URL.createObjectURL(file),
  };
}

export async function requestGeneratedItem({ file, itemId, itemNumber }) {
  const imageDataUrl = await readFileAsDataUrl(file);

  const response = await fetch("/api/generate-item", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      imageDataUrl,
      itemId,
      itemNumber,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || "Generation request failed.");
  }

  if (!payload?.item?.image) {
    throw new Error("Generation response did not include an item image.");
  }

  return payload.item;
}

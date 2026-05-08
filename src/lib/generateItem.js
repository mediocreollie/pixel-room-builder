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
  const formData = new FormData();
  formData.append("image", file);
  formData.append("itemId", itemId);
  formData.append("itemNumber", String(itemNumber));

  const response = await fetch("/api/generate-item", {
    method: "POST",
    body: formData,
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

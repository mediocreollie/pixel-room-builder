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

function buildGeneratedItemFromMetadata({ payload, itemId, itemNumber }) {
  const diagnosis = payload?.diagnosis || {};
  const footprint = diagnosis.footprint || {};
  const render = {};

  if (diagnosis.anchor === "surface-center") {
    render.anchor = "surface-center";
  } else if (diagnosis.anchor === "sprite-floor") {
    render.anchor = "sprite-floor";
  }

  const nextItem = {
    id: payload?.item?.id || itemId,
    name:
      typeof diagnosis.displayName === "string" && diagnosis.displayName.trim()
        ? diagnosis.displayName.trim()
        : "Generated Item",
    width:
      Number.isInteger(footprint.width) && footprint.width > 0
        ? footprint.width
        : 1,
    height:
      Number.isInteger(footprint.height) && footprint.height > 0
        ? footprint.height
        : 1,
    color: payload?.item?.color || "#38bdf8",
    image: payload?.item?.image,
  };

  if (Object.keys(render).length > 0) {
    nextItem.render = render;
  }

  if (!nextItem.name || nextItem.name === "Generated Item") {
    nextItem.name = `Generated Item ${itemNumber}`;
  }

  return nextItem;
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
    item: {
      id: itemId,
      name: `Uploaded Item ${itemNumber}`,
      width: 1,
      height: 1,
      color: "#38bdf8",
      image: URL.createObjectURL(file),
    },
    diagnosis: null,
  };
}

export async function requestGeneratedItem({ file, itemId, itemNumber }) {
  console.info("[generation] create item clicked", {
    realGenerationEnabled: REAL_GENERATION_ENABLED,
    itemId,
    itemNumber,
    fileName: file?.name,
  });

  const imageDataUrl = await readFileAsDataUrl(file);
  const requestUrl = "/api/generate-item";

  console.info("[generation] requestGeneratedItem called", {
    requestUrl,
    imageDataUrlPrefix: imageDataUrl.slice(0, 32),
  });

  const response = await fetch(requestUrl, {
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

  console.info("[generation] backend response received", {
    ok: response.ok,
    status: response.status,
    payloadKeys: payload ? Object.keys(payload) : [],
    error: payload?.error,
  });

  if (!response.ok) {
    throw new Error(payload?.error || "Generation request failed.");
  }

  if (!payload?.item?.image) {
    throw new Error("Generation response did not include an item image.");
  }

  console.info("[generation] image diagnostics", {
    mimeType: payload?.meta?.mimeType,
    startsWithPngBase64:
      typeof payload?.item?.image === "string" &&
      payload.item.image.startsWith("data:image/png;base64,"),
    provider: payload?.meta?.source,
    backendImageDiagnostics: payload?.meta?.imageDiagnostics,
  });

  return {
    item: buildGeneratedItemFromMetadata({
      payload,
      itemId,
      itemNumber,
    }),
    diagnosis: payload?.diagnosis || null,
  };
}

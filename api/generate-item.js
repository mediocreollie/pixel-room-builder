const MOCK_GENERATED_SPRITE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64">
  <g shape-rendering="crispEdges" fill="none" stroke="#5124c1" stroke-width="2" stroke-linejoin="miter">
    <polygon points="12,30 48,39 84,30 48,21" fill="#2fd0c8"/>
    <polygon points="12,30 12,38 48,47 48,39" fill="#25b7b1"/>
    <polygon points="48,39 48,47 84,38 84,30" fill="#1ea39e"/>
    <polygon points="12,18 48,27 84,18 48,9" fill="#2fd0c8"/>
    <polygon points="12,18 12,24 48,33 48,27" fill="#25b7b1"/>
    <polygon points="48,27 48,33 84,24 84,18" fill="#1ea39e"/>
    <polygon points="16,20 28,23 28,31 16,28" fill="#ffffff"/>
    <polygon points="30,24 42,27 42,35 30,32" fill="#ffffff"/>
    <polygon points="44,27 56,30 56,38 44,35" fill="#ffffff"/>
    <polygon points="8,20 15,22 15,36 8,34" fill="#5124c1"/>
    <polygon points="15,22 19,20 19,34 15,36" fill="#2fd0c8"/>
    <polygon points="15,22 21,24 21,28 15,26" fill="#ffffff"/>
    <polygon points="56,30 66,33 66,38 56,35" fill="#ffffff"/>
    <polygon points="66,33 72,31 72,52 66,53" fill="#2fd0c8"/>
    <polygon points="72,31 80,29 80,50 72,52" fill="#5124c1"/>
    <rect x="12" y="39" width="2.5" height="6" fill="#2d2218" stroke="#2d2218"/>
    <rect x="38" y="45" width="2.5" height="5" fill="#2d2218" stroke="#2d2218"/>
    <rect x="64" y="51" width="2.5" height="5" fill="#2d2218" stroke="#2d2218"/>
    <rect x="76" y="37" width="2.5" height="6" fill="#2d2218" stroke="#2d2218"/>
  </g>
</svg>
`;

function createMockItem(itemId, itemNumber) {
  return {
    id: itemId || `uploaded-item-${itemNumber || 1}`,
    name: `Generated Item ${itemNumber || 1}`,
    width: 1,
    height: 1,
    color: "#38bdf8",
    image: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(MOCK_GENERATED_SPRITE)}`,
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({
      error: "Method not allowed. Use POST.",
    });
  }

  const contentType = request.headers["content-type"] || "";

  if (!contentType.includes("multipart/form-data")) {
    return response.status(400).json({
      error: "Expected multipart/form-data with an image upload.",
    });
  }

  const itemId = request.body?.itemId;
  const parsedItemNumber = Number.parseInt(request.body?.itemNumber ?? "1", 10);
  const itemNumber = Number.isNaN(parsedItemNumber) ? 1 : parsedItemNumber;

  return response.status(200).json({
    item: createMockItem(itemId, itemNumber),
    meta: {
      source: "mock-backend",
      provider: "not-configured",
    },
  });
}

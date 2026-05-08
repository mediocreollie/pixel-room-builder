const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const PADDING = 36;
const FLOOR_TOP = PADDING + 36;
const DEBUG_RENDER_AUDIT = false;
const DEBUG_RENDER_VARIANT = "image";

function getIsoPoint(col, row, originX) {
  return {
    x: originX + (col - row) * (TILE_WIDTH / 2),
    y: FLOOR_TOP + (col + row) * (TILE_HEIGHT / 2),
  };
}

function getTileStyle(index, gridSize, originX, findObjectAtTile, previewTiles) {
  const row = Math.floor(index / gridSize);
  const col = index % gridSize;
  const point = getIsoPoint(col, row, originX);
  const placedObject = findObjectAtTile(index);
  const isPlaced = !!placedObject;
  const isPreview = previewTiles.includes(index);
  const hidesPlacedFootprint =
    placedObject?.item?.render?.anchor === "sprite-floor";
  const tileBackground = hidesPlacedFootprint
    ? "#6f7f5d"
    : placedObject?.item?.color;

  return {
    left: point.x - TILE_WIDTH / 2,
    top: point.y,
    background: isPlaced ? tileBackground : isPreview ? "#94a3b8" : "#6f7f5d",
    opacity: isPreview ? 0.7 : 1,
  };
}

function getTileInfo(tileIndex, gridSize, originX) {
  const row = Math.floor(tileIndex / gridSize);
  const col = tileIndex % gridSize;
  const point = getIsoPoint(col, row, originX);

  return {
    index: tileIndex,
    row,
    col,
    x: point.x,
    y: point.y,
    centerX: point.x,
    centerY: point.y + TILE_HEIGHT / 2,
  };
}

function getPerimeterPolygon(occupiedTiles) {
  const edgeMap = new Map();

  function getTilePolygon(tile) {
    return [
      { x: tile.x, y: tile.y },
      { x: tile.x + TILE_WIDTH / 2, y: tile.y + TILE_HEIGHT / 2 },
      { x: tile.x, y: tile.y + TILE_HEIGHT },
      { x: tile.x - TILE_WIDTH / 2, y: tile.y + TILE_HEIGHT / 2 },
    ];
  }

  function pointKey(point) {
    return `${point.x},${point.y}`;
  }

  function edgeKey(start, end) {
    const a = pointKey(start);
    const b = pointKey(end);

    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  for (const tile of occupiedTiles) {
    const polygon = getTilePolygon(tile);

    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const key = edgeKey(start, end);

      if (edgeMap.has(key)) {
        edgeMap.delete(key);
      } else {
        edgeMap.set(key, { start, end });
      }
    }
  }

  const perimeterEdges = Array.from(edgeMap.values());

  if (perimeterEdges.length === 0) {
    return [];
  }

  const adjacency = new Map();

  function addAdjacency(point, neighbor) {
    const key = pointKey(point);
    const neighbors = adjacency.get(key) || [];
    neighbors.push(neighbor);
    adjacency.set(key, neighbors);
  }

  for (const edge of perimeterEdges) {
    addAdjacency(edge.start, edge.end);
    addAdjacency(edge.end, edge.start);
  }

  let startPoint = perimeterEdges[0].start;

  for (const edge of perimeterEdges) {
    if (
      edge.start.y < startPoint.y ||
      (edge.start.y === startPoint.y && edge.start.x < startPoint.x)
    ) {
      startPoint = edge.start;
    }
    if (
      edge.end.y < startPoint.y ||
      (edge.end.y === startPoint.y && edge.end.x < startPoint.x)
    ) {
      startPoint = edge.end;
    }
  }

  const polygon = [startPoint];
  let currentPoint = startPoint;
  let previousPoint = null;

  while (true) {
    const currentNeighbors = adjacency.get(pointKey(currentPoint)) || [];
    const nextPoint = currentNeighbors.find(
      (neighbor) =>
        !previousPoint ||
        neighbor.x !== previousPoint.x ||
        neighbor.y !== previousPoint.y
    );

    if (!nextPoint) {
      break;
    }

    if (nextPoint.x === startPoint.x && nextPoint.y === startPoint.y) {
      break;
    }

    polygon.push(nextPoint);
    previousPoint = currentPoint;
    currentPoint = nextPoint;
  }

  return polygon;
}

function getFootprintMetrics(index, item, gridSize, originX) {
  const startTile = getTileInfo(index, gridSize, originX);
  const row = startTile.row;
  const col = startTile.col;
  const corners = [
    getIsoPoint(col, row, originX),
    getIsoPoint(col + item.width, row, originX),
    getIsoPoint(col + item.width, row + item.height, originX),
    getIsoPoint(col, row + item.height, originX),
  ];
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const occupiedTiles = [];

  for (let y = 0; y < item.height; y += 1) {
    for (let x = 0; x < item.width; x += 1) {
      const tileIndex = index + y * gridSize + x;
      occupiedTiles.push(getTileInfo(tileIndex, gridSize, originX));
    }
  }

  const centerSurfaceX =
    occupiedTiles.reduce((sum, tile) => sum + tile.centerX, 0) / occupiedTiles.length;
  const centerSurfaceY =
    occupiedTiles.reduce((sum, tile) => sum + tile.centerY, 0) / occupiedTiles.length;
  const widthAxisSpan = item.width * (TILE_WIDTH / 2);
  const depthAxisSpan = item.height * (TILE_WIDTH / 2);

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    floorY: maxY,
    surfaceY: centerSurfaceY,
    surfaceX: centerSurfaceX,
    widthAxisSpan,
    depthAxisSpan,
    occupiedTiles,
    polygon: getPerimeterPolygon(occupiedTiles),
    startTile,
  };
}

function getObjectOverlay(placedObject, gridSize, originX) {
  const { index, item } = placedObject;
  const render = item.render || {};
  const scale = render.scale || {};
  const size = render.size || {};
  const offset = render.offset || {};
  const shadow = render.shadow || {};
  const liftConfig = render.lift || {};
  const anchorMode = render.anchor || "bottom-center";
  const isSurfaceCentered = anchorMode === "surface-center";
  const isSpriteFloor = anchorMode === "sprite-floor";
  const footprint = getFootprintMetrics(index, item, gridSize, originX);
  const liftScale = liftConfig.scale || 1;
  const liftOffset = liftConfig.offset || 0;
  const lift = Math.max(16, footprint.height * 0.7 * liftScale) + liftOffset;
  const scaleX = scale.x || 1;
  const scaleY = scale.y || 1;
  const offsetX = offset.x || 0;
  const offsetY = offset.y || 0;
  const shadowScale = shadow.scale || 1;
  const widthBias =
    isSurfaceCentered
      ? 0
      : Math.max(0, footprint.widthAxisSpan - footprint.depthAxisSpan);
  const uprightWidth = (footprint.width + widthBias) * scaleX + 12;
  const uprightHeight = (footprint.height + lift) * scaleY;
  const sizeX = size.x || scaleX;
  const sizeY = size.y || scaleY;
  const surfaceWidth = Math.min(
    footprint.width,
    Math.max(footprint.width * 0.4, footprint.width * sizeX)
  );
  const surfaceHeight = Math.min(
    footprint.height,
    Math.max(footprint.height * 0.4, footprint.height * sizeY)
  );
  const imageWidth =
    isSurfaceCentered ? surfaceWidth : uprightWidth;
  const imageHeight =
    isSurfaceCentered ? surfaceHeight : uprightHeight;
  const shadowWidth = footprint.width * 0.76 * shadowScale;
  const anchorX =
    isSurfaceCentered || isSpriteFloor ? footprint.surfaceX : footprint.centerX;
  const anchorY =
    isSurfaceCentered || isSpriteFloor ? footprint.surfaceY : footprint.floorY;
  const shadowCenterX = anchorX + offsetX;
  const shadowCenterY =
    anchorY - TILE_HEIGHT * 0.28 + Math.max(10, footprint.height * 0.55) / 2;
  const imageTop =
    isSurfaceCentered
      ? anchorY + offsetY
      : anchorY - lift + offsetY;
  const imageTransform =
    isSurfaceCentered
      ? "translate(-50%, -50%)"
      : "translate(-50%, -100%)";
  const imageObjectPosition = isSurfaceCentered ? "center center" : "center bottom";
  const imageClipPath = isSurfaceCentered
    ? `polygon(${footprint.polygon.map((point) => `${point.x}px ${point.y}px`).join(", ")})`
    : undefined;

  if (DEBUG_RENDER_AUDIT) {
    console.log("[render-audit]", {
      objectId: `${item.id}-${index}`,
      itemId: item.id,
      width: item.width,
      height: item.height,
      startIndex: index,
      occupiedTileIndexes: footprint.occupiedTiles.map((tile) => tile.index),
      occupiedTiles: footprint.occupiedTiles.map((tile) => ({
        index: tile.index,
        row: tile.row,
        col: tile.col,
        isoX: tile.x,
        isoY: tile.y,
        centerX: tile.centerX,
        centerY: tile.centerY,
      })),
      minX: footprint.minX,
      maxX: footprint.maxX,
      minY: footprint.minY,
      maxY: footprint.maxY,
      centerX: footprint.centerX,
      centerY: footprint.centerY,
      surfaceX: footprint.surfaceX,
      surfaceY: footprint.surfaceY,
      shadowX: shadowCenterX,
      shadowY: shadowCenterY,
      imageX: anchorX + offsetX,
      imageY: imageTop,
      imageWidth,
      imageHeight,
      transform: imageTransform,
      renderConfig: render,
    });
  }

  return {
    container: {
      left: 0,
      top: 0,
      width: "100%",
      height: "100%",
    },
    spriteMask: {
      left: 0,
      top: 0,
      width: "100%",
      height: "100%",
      clipPath: imageClipPath,
    },
    image: {
      left: anchorX + offsetX,
      top: imageTop,
      width: imageWidth,
      height: imageHeight,
      transform: imageTransform,
      objectPosition: imageObjectPosition,
    },
    shadow: {
      left: shadowCenterX - shadowWidth / 2,
      top: anchorY - TILE_HEIGHT * 0.28,
      width: shadowWidth,
      height: Math.max(10, footprint.height * 0.55),
    },
    debug: {
      center: {
        left: footprint.surfaceX,
        top: footprint.surfaceY,
      },
      anchor: {
        left: anchorX,
        top: anchorY,
      },
      shadow: {
        left: shadowCenterX,
        top: shadowCenterY,
      },
      footprint: {
        left: footprint.minX,
        top: footprint.minY,
        width: footprint.width,
        height: footprint.height,
      },
      imageBox: {
        left: anchorX + offsetX - imageWidth / 2,
        top:
          isSurfaceCentered
            ? imageTop - imageHeight / 2
            : imageTop - imageHeight,
        width: imageWidth,
        height: imageHeight,
      },
      startTile: {
        left: footprint.startTile.centerX,
        top: footprint.startTile.centerY,
      },
      occupiedTiles: footprint.occupiedTiles.map((tile) => ({
        left: tile.centerX,
        top: tile.centerY,
      })),
    },
  };
}

function IsoTileLayer({
  gridSize,
  originX,
  previewTiles,
  findObjectAtTile,
  handleTileClick,
  setHoveredIndex,
}) {
  return (
    <div className="grid-tile-layer">
      {Array.from({ length: gridSize * gridSize }).map((_, index) => (
        <div
          className="grid-tile"
          key={index}
          onClick={() => handleTileClick(index)}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          style={getTileStyle(
            index,
            gridSize,
            originX,
            findObjectAtTile,
            previewTiles
          )}
        />
      ))}
    </div>
  );
}

function FurnitureSprite({ placedObject, overlayStyle }) {
  const isDiagnosticBar =
    DEBUG_RENDER_AUDIT &&
    (placedObject.item.id === "sofa" || placedObject.item.id === "sofa-test-1x3") &&
    DEBUG_RENDER_VARIANT === "footprint-bar";
  const isDiagnosticCross =
    DEBUG_RENDER_AUDIT &&
    (placedObject.item.id === "sofa" || placedObject.item.id === "sofa-test-1x3") &&
    DEBUG_RENDER_VARIANT === "center-cross";
  const isDiagnosticRect =
    DEBUG_RENDER_AUDIT &&
    (placedObject.item.id === "sofa" || placedObject.item.id === "sofa-test-1x3") &&
    DEBUG_RENDER_VARIANT === "anchor-rect";

  return (
    <div className="grid-object" style={overlayStyle.container}>
      {DEBUG_RENDER_AUDIT ? (
        <>
          <div className="grid-object-debug-footprint" style={overlayStyle.debug.footprint} />
          <div className="grid-object-debug-dot is-center" style={overlayStyle.debug.center} />
          <div className="grid-object-debug-dot is-anchor" style={overlayStyle.debug.anchor} />
          <div className="grid-object-debug-dot is-shadow" style={overlayStyle.debug.shadow} />
          <div className="grid-object-debug-dot is-start" style={overlayStyle.debug.startTile} />
          <div className="grid-object-debug-image-box" style={overlayStyle.debug.imageBox} />
          {overlayStyle.debug.occupiedTiles.map((tile, index) => (
            <div
              className="grid-object-debug-dot is-tile"
              key={`${placedObject.item.id}-${placedObject.index}-tile-${index}`}
              style={tile}
            />
          ))}
        </>
      ) : null}

      <div className="grid-object-shadow" style={overlayStyle.shadow} />
      {isDiagnosticBar ? (
        <div className="grid-object-diagnostic-bar" style={overlayStyle.debug.footprint} />
      ) : isDiagnosticCross ? (
        <div className="grid-object-diagnostic-cross" style={overlayStyle.debug.center} />
      ) : isDiagnosticRect ? (
        <div className="grid-object-diagnostic-rect" style={overlayStyle.image} />
      ) : (
        <div className="grid-object-sprite-mask" style={overlayStyle.spriteMask}>
          <img
            className="grid-object-image"
            src={placedObject.item.image}
            alt={placedObject.item.name}
            style={overlayStyle.image}
          />
        </div>
      )}
    </div>
  );
}

function ObjectLayer({ placedObjects, gridSize, originX }) {
  return (
    <div className="grid-object-layer">
      {placedObjects.map((placedObject) => {
        if (!placedObject.item.image) return null;

        const overlayStyle = getObjectOverlay(placedObject, gridSize, originX);

        return (
          <FurnitureSprite
            key={`${placedObject.item.id}-${placedObject.index}`}
            placedObject={placedObject}
            overlayStyle={overlayStyle}
          />
        );
      })}
    </div>
  );
}

function GridBoard({
  gridSize,
  placedObjects,
  previewTiles,
  findObjectAtTile,
  handleTileClick,
  setHoveredIndex,
}) {
  const sceneWidth = gridSize * TILE_WIDTH + PADDING * 2;
  const sceneHeight = gridSize * TILE_HEIGHT + TILE_HEIGHT + PADDING * 3;
  const originX = sceneWidth / 2;

  return (
    <div className="grid-board" style={{ width: sceneWidth, height: sceneHeight }}>
      <IsoTileLayer
        gridSize={gridSize}
        originX={originX}
        previewTiles={previewTiles}
        findObjectAtTile={findObjectAtTile}
        handleTileClick={handleTileClick}
        setHoveredIndex={setHoveredIndex}
      />

      <ObjectLayer
        placedObjects={placedObjects}
        gridSize={gridSize}
        originX={originX}
      />
    </div>
  );
}

export default GridBoard;

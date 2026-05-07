const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const PADDING = 36;
const FLOOR_TOP = PADDING + 36;
const DEBUG_OBJECT_ANCHORS = false;

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

  return {
    left: point.x - TILE_WIDTH / 2,
    top: point.y,
    background: isPlaced ? placedObject.item.color : isPreview ? "#94a3b8" : "#6f7f5d",
    opacity: isPreview ? 0.7 : 1,
  };
}

function getFootprintMetrics(index, item, gridSize, originX) {
  const row = Math.floor(index / gridSize);
  const col = index % gridSize;
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
  const tileCenters = [];

  for (let y = 0; y < item.height; y += 1) {
    for (let x = 0; x < item.width; x += 1) {
      const point = getIsoPoint(col + x, row + y, originX);

      tileCenters.push({
        x: point.x,
        y: point.y + TILE_HEIGHT / 2,
      });
    }
  }

  const centerSurfaceX =
    tileCenters.reduce((sum, tile) => sum + tile.x, 0) / tileCenters.length;
  const centerSurfaceY =
    tileCenters.reduce((sum, tile) => sum + tile.y, 0) / tileCenters.length;
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
  };
}

function getObjectOverlay(placedObject, gridSize, originX) {
  const { index, item } = placedObject;
  const render = item.render || {};
  const scale = render.scale || {};
  const offset = render.offset || {};
  const shadow = render.shadow || {};
  const liftConfig = render.lift || {};
  const footprint = getFootprintMetrics(index, item, gridSize, originX);
  const liftScale = liftConfig.scale || 1;
  const liftOffset = liftConfig.offset || 0;
  const lift = Math.max(16, footprint.height * 0.7 * liftScale) + liftOffset;
  const scaleX = scale.x || 1;
  const scaleY = scale.y || 1;
  const offsetX = offset.x || 0;
  const offsetY = offset.y || 0;
  const shadowScale = shadow.scale || 1;
  const widthBias = Math.max(0, footprint.widthAxisSpan - footprint.depthAxisSpan);
  const imageWidth = (footprint.width + widthBias) * scaleX + 12;
  const imageHeight = (footprint.height + lift) * scaleY;
  const shadowWidth = footprint.width * 0.76 * shadowScale;
  const anchorX = footprint.surfaceX;
  const anchorY = footprint.surfaceY;

  return {
    container: {
      left: 0,
      top: 0,
      width: "100%",
      height: "100%",
    },
    image: {
      left: anchorX + offsetX,
      top: anchorY - lift + offsetY,
      width: imageWidth,
      height: imageHeight,
      transform: "translate(-50%, -100%)",
    },
    shadow: {
      left: anchorX - shadowWidth / 2 + offsetX,
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
      footprint: {
        left: footprint.minX,
        top: footprint.minY,
        width: footprint.width,
        height: footprint.height,
      },
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
  return (
    <div className="grid-object" style={overlayStyle.container}>
      {DEBUG_OBJECT_ANCHORS ? (
        <>
          <div className="grid-object-debug-footprint" style={overlayStyle.debug.footprint} />
          <div className="grid-object-debug-dot is-center" style={overlayStyle.debug.center} />
          <div className="grid-object-debug-dot is-anchor" style={overlayStyle.debug.anchor} />
        </>
      ) : null}

      <div className="grid-object-shadow" style={overlayStyle.shadow} />
      <img
        className="grid-object-image"
        src={placedObject.item.image}
        alt={placedObject.item.name}
        style={overlayStyle.image}
      />
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

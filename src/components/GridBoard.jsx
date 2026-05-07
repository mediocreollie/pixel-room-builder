const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const PADDING = 36;
const FLOOR_TOP = PADDING + 36;

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

function getObjectOverlay(placedObject, gridSize, originX) {
  const { index, item } = placedObject;
  const render = item.render || {};
  const scale = render.scale || {};
  const offset = render.offset || {};
  const shadow = render.shadow || {};
  const liftConfig = render.lift || {};
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
  const footprintWidth = maxX - minX;
  const footprintHeight = maxY - minY;
  const liftScale = liftConfig.scale || 1;
  const liftOffset = liftConfig.offset || 0;
  const lift = Math.max(16, footprintHeight * 0.7 * liftScale) + liftOffset;
  const scaleX = scale.x || 1;
  const scaleY = scale.y || 1;
  const offsetX = offset.x || 0;
  const offsetY = offset.y || 0;
  const shadowScale = shadow.scale || 1;
  const imageWidth = footprintWidth * scaleX + 12;
  const imageHeight = (footprintHeight + lift) * scaleY;

  return {
    container: {
      left: minX - 6,
      top: minY - lift,
      width: footprintWidth + 12,
      height: footprintHeight + lift + 6,
    },
    image: {
      left: (footprintWidth + 12 - imageWidth) / 2 + offsetX,
      top: lift + footprintHeight - imageHeight + offsetY,
      width: imageWidth,
      height: imageHeight,
    },
    shadow: {
      left: footprintWidth * (0.5 - 0.38 * shadowScale),
      top: lift + footprintHeight * 0.18,
      width: footprintWidth * 0.76 * shadowScale,
      height: Math.max(10, footprintHeight * 0.55),
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

function GridBoard({
  gridSize,
  placedObjects,
  previewTiles,
  findObjectAtTile,
  handleTileClick,
  setHoveredIndex,
}) {
  const tileWidth = 64;
  const tileHeight = 32;
  const padding = 36;
  const floorTop = padding + 36;
  const sceneWidth = gridSize * tileWidth + padding * 2;
  const sceneHeight = gridSize * tileHeight + tileHeight + padding * 3;
  const originX = sceneWidth / 2;

  function getIsoPoint(col, row) {
    return {
      x: originX + (col - row) * (tileWidth / 2),
      y: floorTop + (col + row) * (tileHeight / 2),
    };
  }

  function getTileStyle(index) {
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;
    const point = getIsoPoint(col, row);
    const placedObject = findObjectAtTile(index);
    const isPlaced = !!placedObject;
    const isPreview = previewTiles.includes(index);

    return {
      left: point.x - tileWidth / 2,
      top: point.y,
      background: isPlaced ? placedObject.item.color : isPreview ? "#94a3b8" : "#6f7f5d",
      opacity: isPreview ? 0.7 : 1,
    };
  }

  function getObjectOverlay(placedObject) {
    const { index, item } = placedObject;
    const render = item.render || {};
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;
    const corners = [
      getIsoPoint(col, row),
      getIsoPoint(col + item.width, row),
      getIsoPoint(col + item.width, row + item.height),
      getIsoPoint(col, row + item.height),
    ];
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const footprintWidth = maxX - minX;
    const footprintHeight = maxY - minY;
    const liftScale = render.liftScale || 1;
    const liftOffset = render.liftOffset || 0;
    const lift = Math.max(16, footprintHeight * 0.7 * liftScale) + liftOffset;
    const scaleX = render.scaleX || 1;
    const scaleY = render.scaleY || 1;
    const offsetX = render.offsetX || 0;
    const offsetY = render.offsetY || 0;
    const shadowScale = render.shadowScale || 1;
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

  return (
    <div
      className="grid-board"
      style={{ width: sceneWidth, height: sceneHeight }}
    >
      <div className="grid-tile-layer">
        {Array.from({ length: gridSize * gridSize }).map((_, index) => (
          <div
            className="grid-tile"
            key={index}
            onClick={() => handleTileClick(index)}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={getTileStyle(index)}
          />
        ))}
      </div>

      <div className="grid-object-layer">
        {placedObjects.map((placedObject) => {
          if (!placedObject.item.image) return null;

          const overlayStyle = getObjectOverlay(placedObject);

          return (
            <div
              key={`${placedObject.item.id}-${placedObject.index}`}
              className="grid-object"
              style={overlayStyle.container}
            >
              <div
                className="grid-object-shadow"
                style={overlayStyle.shadow}
              />
              <img
                className="grid-object-image"
                src={placedObject.item.image}
                alt={placedObject.item.name}
                style={overlayStyle.image}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default GridBoard;

export function getObjectTiles(startIndex, item, gridSize) {
  const tiles = [];

  for (let rowOffset = 0; rowOffset < item.height; rowOffset++) {
    for (let colOffset = 0; colOffset < item.width; colOffset++) {
      tiles.push(startIndex + rowOffset * gridSize + colOffset);
    }
  }

  return tiles;
}

export function canPlace(startIndex, item, gridSize) {
  const col = startIndex % gridSize;
  const row = Math.floor(startIndex / gridSize);

  return col + item.width <= gridSize && row + item.height <= gridSize;
}

export function doesOverlap(newTiles, placedObjects, gridSize) {
  const occupied = placedObjects.flatMap((obj) =>
    getObjectTiles(obj.index, obj.item, gridSize)
  );

  return newTiles.some((tile) => occupied.includes(tile));
}

export function findObjectAtTile(tileIndex, placedObjects, gridSize) {
  return placedObjects.find((obj) =>
    getObjectTiles(obj.index, obj.item, gridSize).includes(tileIndex)
  );
}

import { useEffect, useState } from "react";
import GridBoard from "./components/GridBoard";
import InventoryPanel from "./components/InventoryPanel";
import Toolbar from "./components/Toolbar";
import UploadPanel from "./components/UploadPanel";
import initialItems from "./data/furnitureItems";
import {
  createFakeGeneratedItem,
  isRealGenerationEnabled,
  requestGeneratedItem,
} from "./lib/generateItem";
import {
  canPlace,
  doesOverlap,
  findObjectAtTile,
  getObjectTiles,
} from "./utils/grid";

const PLACED_OBJECTS_STORAGE_KEY = "furniture-pixel-app-placed-objects";

function isUploadedItem(item) {
  return item.id?.startsWith("uploaded-item-");
}

function hydratePlacedObject(savedObject, itemCatalog) {
  const itemId = savedObject.itemId ?? savedObject.item?.id;
  const position = savedObject.position ?? savedObject.index;

  if (!itemId || typeof position !== "number") {
    return null;
  }

  const item = itemCatalog[itemId];

  if (!item || isUploadedItem(item)) {
    return null;
  }

  return {
    id: savedObject.id ?? `${itemId}-${position}`,
    index: position,
    item,
  };
}

function getSavedPlacedObjects(itemCatalog) {
  const savedPlacedObjects = localStorage.getItem(PLACED_OBJECTS_STORAGE_KEY);

  if (!savedPlacedObjects) return [];

  try {
    const parsedPlacedObjects = JSON.parse(savedPlacedObjects);

    if (!Array.isArray(parsedPlacedObjects)) {
      return [];
    }

    return parsedPlacedObjects
      .map((savedObject) => hydratePlacedObject(savedObject, itemCatalog))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function App() {
  const gridSize = 8;

  const [items, setItems] = useState(initialItems);
  const [placedObjects, setPlacedObjects] = useState(() =>
    getSavedPlacedObjects(initialItems)
  );
  const [selectedItem, setSelectedItem] = useState("table");
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [mode, setMode] = useState("place");
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [uploadMessage, setUploadMessage] = useState("");

  useEffect(() => {
    const savedPlacedObjects = placedObjects.filter(
      (object) => !isUploadedItem(object.item)
    );

    localStorage.setItem(
      PLACED_OBJECTS_STORAGE_KEY,
      JSON.stringify(
        savedPlacedObjects.map((object) => ({
          id: object.id ?? `${object.item.id}-${object.index}`,
          itemId: object.item.id,
          position: object.index,
        }))
      )
    );
  }, [placedObjects]);

  useEffect(() => {
    setItems((currentItems) => {
      const uploadedItems = Object.fromEntries(
        Object.entries(currentItems).filter(([, item]) => isUploadedItem(item))
      );

      return {
        ...initialItems,
        ...uploadedItems,
      };
    });
  }, [initialItems]);

  useEffect(() => {
    setPlacedObjects((currentPlacedObjects) =>
      currentPlacedObjects.map((object) => {
        if (isUploadedItem(object.item)) {
          return object;
        }

        const currentItem = initialItems[object.item.id];

        if (!currentItem) {
          return object;
        }

        return {
          ...object,
          item: currentItem,
        };
      })
    );
  }, [initialItems]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [selectedFile]);

  function handleFileChange(event) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadMessage("");
  }

  async function handleCreateItem() {
    if (!selectedFile || isCreatingItem) return;

    setIsCreatingItem(true);
    setUploadMessage("");

    const createdItemCount = Object.keys(items).filter((itemKey) =>
      itemKey.startsWith("uploaded-item-")
    ).length;
    const nextItemKey = `uploaded-item-${createdItemCount + 1}`;
    const itemNumber = createdItemCount + 1;

    try {
      let nextItem;

      if (isRealGenerationEnabled()) {
        try {
          nextItem = await requestGeneratedItem({
            file: selectedFile,
            itemId: nextItemKey,
            itemNumber,
          });
          setUploadMessage("AI-generated item created.");
        } catch (error) {
          console.error("Falling back to fake item generation.", error);
          setUploadMessage("Backend request failed. Used local fallback instead.");
          nextItem = await createFakeGeneratedItem({
            file: selectedFile,
            itemId: nextItemKey,
            itemNumber,
          });
        }
      } else {
        nextItem = await createFakeGeneratedItem({
          file: selectedFile,
          itemId: nextItemKey,
          itemNumber,
        });
        setUploadMessage("Local mock item created.");
      }

      setItems((currentItems) => ({
        ...currentItems,
        [nextItemKey]: nextItem,
      }));

      setSelectedItem(nextItemKey);
      setSelectedFile(null);
      setPreviewUrl("");
      setUploadInputKey((currentKey) => currentKey + 1);
    } finally {
      setIsCreatingItem(false);
    }
  }

  function handleTileClick(index) {
    if (mode === "remove") {
      const objectToRemove = findObjectAtTile(index, placedObjects, gridSize);
      if (!objectToRemove) return;

      setPlacedObjects(
        placedObjects.filter(
          (obj) =>
            !(
              obj.index === objectToRemove.index &&
              obj.item.id === objectToRemove.item.id
            )
        )
      );
      return;
    }

    const item = items[selectedItem];

    if (!canPlace(index, item, gridSize)) return;

    const newTiles = getObjectTiles(index, item, gridSize);

    if (doesOverlap(newTiles, placedObjects, gridSize)) return;

    setPlacedObjects([
      ...placedObjects,
      {
        id: `${item.id}-${index}-${Date.now()}`,
        index,
        item,
      },
    ]);
  }

  function getTileColor(index) {
    const object = findObjectAtTile(index, placedObjects, gridSize);
    return object ? object.item.color : "#222";
  }

  function getPreviewTiles() {
    if (hoveredIndex === null || mode !== "place") return [];

    const item = items[selectedItem];
    if (!canPlace(hoveredIndex, item, gridSize)) return [];

    const previewTiles = getObjectTiles(hoveredIndex, item, gridSize);
    if (doesOverlap(previewTiles, placedObjects, gridSize)) return [];

    return previewTiles;
  }

  const previewTiles = getPreviewTiles();

  return (
    <div className="app">
      <div className="app-shell">
        <div className="app-header">
          <p className="app-eyebrow">Furniture layout MVP</p>
          <h1 className="app-title">Furniture Pixel App</h1>
          <p className="app-subtitle">
            Place furniture on the room grid, preview before placing, and switch to remove
            mode when you want to clear objects.
          </p>
        </div>

        <Toolbar
          mode={mode}
          setMode={setMode}
        />

        <div className="app-status">
          <div className="status-card">
            <span className="status-label">Selected item</span>
            <strong className="status-value">{items[selectedItem]?.name}</strong>
          </div>

          <div className="status-card">
            <span className="status-label">Current mode</span>
            <strong className="status-value">
              {mode === "place" ? "Place Mode" : "Remove Mode"}
            </strong>
          </div>
        </div>

        <div className="app-main">
          <div className="room-panel">
            <div className="room-panel-header">
              <h2 className="room-title">Room Grid</h2>
              <p className="room-caption">8 x 8 layout</p>
            </div>

            <GridBoard
              gridSize={gridSize}
              placedObjects={placedObjects}
              previewTiles={previewTiles}
              findObjectAtTile={(index) => findObjectAtTile(index, placedObjects, gridSize)}
              handleTileClick={handleTileClick}
              setHoveredIndex={setHoveredIndex}
            />
          </div>

          <div className="app-sidebar">
            <InventoryPanel
              items={items}
              selectedItem={selectedItem}
              setSelectedItem={setSelectedItem}
            />

            <UploadPanel
              inputKey={uploadInputKey}
              selectedFile={selectedFile}
              previewUrl={previewUrl}
            handleFileChange={handleFileChange}
            handleCreateItem={handleCreateItem}
            isCreatingItem={isCreatingItem}
            uploadMessage={uploadMessage}
          />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

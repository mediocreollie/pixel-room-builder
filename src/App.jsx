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
const AUTO_OVERRIDE_VALUE = "auto";
const MAX_GENERATION_HISTORY = 8;

function getAnchorLabel(item) {
  const anchor = item.render?.anchor;

  if (!anchor || anchor === "bottom-center") {
    return "upright";
  }

  return anchor;
}

function applyGeneratedOverrides(item, overrides) {
  const nextItem = {
    ...item,
  };

  if (overrides.footprint && overrides.footprint !== AUTO_OVERRIDE_VALUE) {
    const [width, height] = overrides.footprint.split("x").map(Number);

    if (Number.isInteger(width) && Number.isInteger(height)) {
      nextItem.width = width;
      nextItem.height = height;
    }
  }

  if (overrides.anchor && overrides.anchor !== AUTO_OVERRIDE_VALUE) {
    nextItem.render = {
      ...(nextItem.render || {}),
      anchor: overrides.anchor === "upright" ? "bottom-center" : overrides.anchor,
    };
  } else if (nextItem.render?.anchor === "bottom-center") {
    const nextRender = { ...(nextItem.render || {}) };
    delete nextRender.anchor;

    if (Object.keys(nextRender).length > 0) {
      nextItem.render = nextRender;
    } else {
      delete nextItem.render;
    }
  }

  return nextItem;
}

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
  const [latestDiagnosis, setLatestDiagnosis] = useState(null);
  const [overrideFootprint, setOverrideFootprint] = useState(AUTO_OVERRIDE_VALUE);
  const [overrideAnchor, setOverrideAnchor] = useState(AUTO_OVERRIDE_VALUE);
  const [latestGeneratedItemKey, setLatestGeneratedItemKey] = useState("");
  const [latestGeneratedBaseItem, setLatestGeneratedBaseItem] = useState(null);
  const [latestSourceFile, setLatestSourceFile] = useState(null);
  const [generationHistory, setGenerationHistory] = useState([]);

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
    setLatestSourceFile(file);
    setUploadMessage("");
    setLatestDiagnosis(null);
    setOverrideFootprint(AUTO_OVERRIDE_VALUE);
    setOverrideAnchor(AUTO_OVERRIDE_VALUE);
    setLatestGeneratedItemKey("");
    setLatestGeneratedBaseItem(null);
  }

  useEffect(() => {
    if (!latestGeneratedItemKey || !latestGeneratedBaseItem || !latestDiagnosis?.available) {
      return;
    }

    const overrides = {
      footprint: overrideFootprint,
      anchor: overrideAnchor,
    };

    setItems((currentItems) => {
      if (!currentItems[latestGeneratedItemKey]) {
        return currentItems;
      }

      return {
        ...currentItems,
        [latestGeneratedItemKey]: applyGeneratedOverrides(latestGeneratedBaseItem, overrides),
      };
    });
  }, [
    latestDiagnosis,
    latestGeneratedBaseItem,
    latestGeneratedItemKey,
    overrideAnchor,
    overrideFootprint,
  ]);

  useEffect(() => {
    if (!latestGeneratedItemKey) {
      return;
    }

    setGenerationHistory((currentHistory) =>
      currentHistory.map((entry) => {
        if (entry.itemKey !== latestGeneratedItemKey) {
          return entry;
        }

        const nextFootprint =
          overrideFootprint !== AUTO_OVERRIDE_VALUE
            ? overrideFootprint
            : `${entry.diagnosisState?.data?.footprint?.width || entry.footprint.width}x${
                entry.diagnosisState?.data?.footprint?.height || entry.footprint.height
              }`;
        const nextAnchor =
          overrideAnchor !== AUTO_OVERRIDE_VALUE
            ? overrideAnchor
            : entry.diagnosisState?.data?.anchor || entry.anchor;

        return {
          ...entry,
          footprint: {
            width: Number(nextFootprint.split("x")[0]),
            height: Number(nextFootprint.split("x")[1]),
          },
          anchor: nextAnchor,
          overrideFootprint,
          overrideAnchor,
        };
      })
    );
  }, [latestGeneratedItemKey, overrideAnchor, overrideFootprint]);

  function addHistoryEntry({
    itemKey,
    item,
    baseItem,
    diagnosisState,
    overrideState,
    sourceFileName,
  }) {
    setGenerationHistory((currentHistory) => {
      const nextOrder = currentHistory.length > 0 ? currentHistory[0].order + 1 : 1;
      const nextEntry = {
        id: `${itemKey}-${Date.now()}`,
        itemKey,
        image: item.image,
        displayName: item.name,
        footprint: {
          width: item.width,
          height: item.height,
        },
        anchor: getAnchorLabel(item),
        createdAt: Date.now(),
        order: nextOrder,
        diagnosisState,
        overrideFootprint: overrideState.footprint,
        overrideAnchor: overrideState.anchor,
        baseItem,
        sourceFileName,
      };

      return [nextEntry, ...currentHistory].slice(0, MAX_GENERATION_HISTORY);
    });
  }

  async function runGeneration(sourceFile) {
    if (!sourceFile || isCreatingItem) return;

    setIsCreatingItem(true);
    setUploadMessage("");
    setLatestSourceFile(sourceFile);
    const overrideState = latestDiagnosis?.available
      ? {
          footprint: overrideFootprint,
          anchor: overrideAnchor,
        }
      : {
          footprint: AUTO_OVERRIDE_VALUE,
          anchor: AUTO_OVERRIDE_VALUE,
        };

    const createdItemCount = Object.keys(items).filter((itemKey) =>
      itemKey.startsWith("uploaded-item-")
    ).length;
    const nextItemKey = `uploaded-item-${createdItemCount + 1}`;
    const itemNumber = createdItemCount + 1;

    try {
      let generationResult;
      let diagnosisState;

      if (isRealGenerationEnabled()) {
        try {
          generationResult = await requestGeneratedItem({
            file: sourceFile,
            itemId: nextItemKey,
            itemNumber,
          });
          diagnosisState = {
            available: true,
            source: "ai",
            data: generationResult.diagnosis,
          };
          setUploadMessage("AI-generated item created.");
          setLatestDiagnosis(diagnosisState);
          setOverrideFootprint(overrideState.footprint);
          setOverrideAnchor(overrideState.anchor);
          setLatestGeneratedItemKey(nextItemKey);
          setLatestGeneratedBaseItem(generationResult.item);
        } catch (error) {
          console.error("Falling back to fake item generation.", error);
          const failureReason =
            error instanceof Error ? error.message : "Unknown backend failure.";
          setUploadMessage(
            `Backend request failed: ${failureReason}. Used local fallback instead.`
          );
          generationResult = await createFakeGeneratedItem({
            file: sourceFile,
            itemId: nextItemKey,
            itemNumber,
          });
          diagnosisState = {
            available: false,
            source: "fallback",
            data: null,
          };
          setLatestDiagnosis(diagnosisState);
          setOverrideFootprint(AUTO_OVERRIDE_VALUE);
          setOverrideAnchor(AUTO_OVERRIDE_VALUE);
          setLatestGeneratedItemKey("");
          setLatestGeneratedBaseItem(null);
        }
      } else {
        generationResult = await createFakeGeneratedItem({
          file: sourceFile,
          itemId: nextItemKey,
          itemNumber,
        });
        diagnosisState = {
          available: false,
          source: "fake",
          data: null,
        };
        setUploadMessage("Local mock item created.");
        setLatestDiagnosis(diagnosisState);
        setOverrideFootprint(AUTO_OVERRIDE_VALUE);
        setOverrideAnchor(AUTO_OVERRIDE_VALUE);
        setLatestGeneratedItemKey("");
        setLatestGeneratedBaseItem(null);
      }

      const finalItem =
        isRealGenerationEnabled() && generationResult.diagnosis
          ? applyGeneratedOverrides(generationResult.item, {
              footprint: overrideState.footprint,
              anchor: overrideState.anchor,
            })
          : generationResult.item;

      setItems((currentItems) => ({
        ...currentItems,
        [nextItemKey]: finalItem,
      }));

      addHistoryEntry({
        itemKey: nextItemKey,
        item: finalItem,
        baseItem: generationResult.item,
        diagnosisState,
        overrideState,
        sourceFileName: sourceFile.name,
      });

      setSelectedItem(nextItemKey);
      setSelectedFile(null);
      setPreviewUrl("");
      setUploadInputKey((currentKey) => currentKey + 1);
    } finally {
      setIsCreatingItem(false);
    }
  }

  async function handleCreateItem() {
    await runGeneration(selectedFile);
  }

  async function handleRegenerateLatest() {
    await runGeneration(latestSourceFile);
  }

  function handleHistorySelect(entry) {
    setSelectedItem(entry.itemKey);
    setLatestDiagnosis(entry.diagnosisState);
    setOverrideFootprint(entry.overrideFootprint || AUTO_OVERRIDE_VALUE);
    setOverrideAnchor(entry.overrideAnchor || AUTO_OVERRIDE_VALUE);
    setLatestGeneratedItemKey(entry.itemKey);
    setLatestGeneratedBaseItem(entry.baseItem || items[entry.itemKey] || null);
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
              latestDiagnosis={latestDiagnosis}
              overrideFootprint={overrideFootprint}
              overrideAnchor={overrideAnchor}
              setOverrideFootprint={setOverrideFootprint}
              setOverrideAnchor={setOverrideAnchor}
              generationHistory={generationHistory}
              selectedItem={selectedItem}
              handleHistorySelect={handleHistorySelect}
              handleRegenerateLatest={handleRegenerateLatest}
              canRegenerate={!!latestSourceFile && !isCreatingItem}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

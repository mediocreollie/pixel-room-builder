function InventoryPanel({ items, selectedItem, setSelectedItem }) {
  return (
    <div className="inventory-panel">
      <div className="inventory-panel-header">
        <h2 className="inventory-title">Inventory</h2>
        <p className="inventory-caption">Choose a furniture item to place</p>
      </div>

      <div className="inventory-grid">
        {Object.entries(items).map(([itemKey, item]) => {
          const isActive = selectedItem === itemKey;

          return (
            <button
              key={itemKey}
              className={`inventory-card ${isActive ? "is-active" : ""}`}
              onClick={() => setSelectedItem(itemKey)}
            >
              <span className="inventory-card-media">
                {item.image ? (
                  <img
                    className="inventory-preview-image"
                    src={item.image}
                    alt={item.name}
                  />
                ) : (
                  <span
                    className="inventory-swatch"
                    style={{ backgroundColor: item.color }}
                  />
                )}
              </span>
              <span className="inventory-card-title">{item.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default InventoryPanel;

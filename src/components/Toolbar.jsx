function Toolbar({ mode, setMode }) {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <span className="toolbar-label">Mode</span>
        <div className="toolbar-actions">
          <button
            className={`toolbar-button ${mode === "place" ? "is-active" : ""}`}
            onClick={() => setMode("place")}
          >
            Place Mode
          </button>
          <button
            className={`toolbar-button ${mode === "remove" ? "is-active" : ""}`}
            onClick={() => setMode("remove")}
          >
            Remove Mode
          </button>
        </div>
      </div>
    </div>
  );
}

export default Toolbar;

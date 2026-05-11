function UploadPanel({
  inputKey,
  selectedFile,
  previewUrl,
  objectTypeHint,
  setObjectTypeHint,
  handleFileChange,
  handleCreateItem,
  isCreatingItem,
  uploadMessage,
  latestDiagnosis,
  overrideFootprint,
  overrideAnchor,
  setOverrideFootprint,
  setOverrideAnchor,
  generationHistory,
  selectedItem,
  handleHistorySelect,
  handleRegenerateLatest,
  canRegenerate,
  latestGenerationMeta,
}) {
  const diagnosis = latestDiagnosis?.data;
  const hasDiagnosis = latestDiagnosis?.available && diagnosis;
  const showTroubleshooting = latestGenerationMeta?.failed;

  return (
    <div className="upload-panel">
      <div className="upload-panel-header">
        <h2 className="upload-title">Upload Reference</h2>
        <p className="upload-caption">
          Choose a room or furniture image for the future item creation flow.
        </p>
      </div>

      <label className="upload-input-label" htmlFor="reference-image">
        Choose image
      </label>
      <input
        key={inputKey}
        id="reference-image"
        className="upload-input"
        type="file"
        accept="image/*"
        onChange={handleFileChange}
      />

      <label className="upload-input-label" htmlFor="object-type-hint">
        Object type
      </label>
      <input
        id="object-type-hint"
        className="upload-text-input"
        type="text"
        value={objectTypeHint}
        onChange={(event) => setObjectTypeHint(event.target.value)}
        placeholder="e.g. outdoor table, chair, sofa, lamp"
      />

      <div className="upload-preview">
        {previewUrl ? (
          <img
            className="upload-preview-image"
            src={previewUrl}
            alt="Selected upload preview"
          />
        ) : (
          <div className="upload-preview-empty">
            <span>No image selected yet</span>
          </div>
        )}
      </div>

      <div className="upload-footer">
        <p className="upload-file-name">
          {selectedFile ? selectedFile.name : "No file selected"}
        </p>
        <button
          className="toolbar-button"
          type="button"
          onClick={handleCreateItem}
          disabled={!selectedFile || isCreatingItem}
        >
          {isCreatingItem ? "Creating item..." : "Create item"}
        </button>
        {isCreatingItem ? (
          <p className="upload-feedback">Creating item...</p>
        ) : uploadMessage ? (
          <p className="upload-feedback">{uploadMessage}</p>
        ) : null}
      </div>

      <div className="diagnosis-panel">
        <div className="diagnosis-panel-header">
          <h3 className="diagnosis-title">Latest Diagnosis</h3>
        </div>

        {hasDiagnosis ? (
          <div className="diagnosis-content">
            <p className="diagnosis-row">
              <span className="diagnosis-label">Object type</span>
              <strong>{diagnosis.objectType}</strong>
            </p>
            <p className="diagnosis-row">
              <span className="diagnosis-label">Display name</span>
              <strong>{diagnosis.displayName}</strong>
            </p>
            <p className="diagnosis-row">
              <span className="diagnosis-label">Footprint</span>
              <strong>
                {diagnosis.footprint?.width} x {diagnosis.footprint?.height}
              </strong>
            </p>
            <p className="diagnosis-row">
              <span className="diagnosis-label">Anchor</span>
              <strong>{diagnosis.anchor}</strong>
            </p>
            <p className="diagnosis-description">{diagnosis.description}</p>

            <div className="diagnosis-overrides">
              <label className="diagnosis-control">
                <span className="diagnosis-label">Footprint override</span>
                <select
                  className="diagnosis-select"
                  value={overrideFootprint}
                  onChange={(event) => setOverrideFootprint(event.target.value)}
                >
                  <option value="auto">
                    Auto ({diagnosis.footprint?.width}x{diagnosis.footprint?.height})
                  </option>
                  <option value="1x1">1x1</option>
                  <option value="2x1">2x1</option>
                  <option value="1x2">1x2</option>
                  <option value="2x2">2x2</option>
                  <option value="3x1">3x1</option>
                </select>
              </label>

              <label className="diagnosis-control">
                <span className="diagnosis-label">Anchor override</span>
                <select
                  className="diagnosis-select"
                  value={overrideAnchor}
                  onChange={(event) => setOverrideAnchor(event.target.value)}
                >
                  <option value="auto">Auto ({diagnosis.anchor})</option>
                  <option value="upright">Default / Upright</option>
                  <option value="surface-center">Surface-center</option>
                  <option value="sprite-floor">Sprite-floor</option>
                </select>
              </label>
            </div>
          </div>
        ) : latestDiagnosis?.source === "fallback" ? (
          <p className="diagnosis-empty">
            No AI diagnosis was available. The app used the local fallback flow.
          </p>
        ) : latestDiagnosis?.source === "fake" ? (
          <p className="diagnosis-empty">
            No AI diagnosis yet. Fake mode is active, so local items do not use backend
            classification.
          </p>
        ) : (
          <p className="diagnosis-empty">
            Generate an item to see what the AI thought the uploaded object was.
          </p>
        )}
      </div>

      {showTroubleshooting ? (
        <div className="diagnosis-panel diagnosis-panel-warning">
          <div className="diagnosis-panel-header">
            <h3 className="diagnosis-title">Generation Troubleshooting</h3>
          </div>
          <div className="diagnosis-content">
            <p className="diagnosis-row">
              <span className="diagnosis-label">Provider</span>
              <strong>{latestGenerationMeta.provider || "backend"}</strong>
            </p>
            <p className="diagnosis-row">
              <span className="diagnosis-label">Workflow mode</span>
              <strong>{latestGenerationMeta.workflowMode || "unknown"}</strong>
            </p>
            <p className="diagnosis-row">
              <span className="diagnosis-label">Fallback reason</span>
              <strong>{latestGenerationMeta.fallbackReason || "local fallback triggered"}</strong>
            </p>
            <p className="diagnosis-description">
              {latestGenerationMeta.summary || "The backend returned an error before item generation completed."}
            </p>
            <div className="diagnosis-troubleshooting">
              <p className="diagnosis-label">Possible causes</p>
              <ul className="diagnosis-troubleshooting-list">
                <li>ComfyUI not running</li>
                <li>invalid API workflow export</li>
                <li>checkpoint mismatch</li>
                <li>missing LoadImage node</li>
                <li>workflow node id mismatch</li>
                <li>timeout</li>
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <div className="history-panel">
        <div className="history-panel-header">
          <h3 className="diagnosis-title">Generation History</h3>
          <button
            className="toolbar-button"
            type="button"
            onClick={handleRegenerateLatest}
            disabled={!canRegenerate}
          >
            Regenerate
          </button>
        </div>

        {generationHistory.length > 0 ? (
          <div className="history-list">
            {generationHistory.map((entry) => {
              const isActive = selectedItem === entry.itemKey;

              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`history-card ${isActive ? "is-active" : ""}`}
                  onClick={() => handleHistorySelect(entry)}
                >
                  <img
                    className="history-card-image"
                    src={entry.image}
                    alt={entry.displayName}
                  />
                  <span className="history-card-meta">
                    <strong>{entry.displayName}</strong>
                    <span>
                      {entry.footprint.width}x{entry.footprint.height} · {entry.anchor}
                    </span>
                    <span>#{entry.order}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="diagnosis-empty">
            Generated items from this session will appear here for quick reuse.
          </p>
        )}
      </div>
    </div>
  );
}

export default UploadPanel;

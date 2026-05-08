function UploadPanel({
  inputKey,
  selectedFile,
  previewUrl,
  handleFileChange,
  handleCreateItem,
  isCreatingItem,
  uploadMessage,
  latestDiagnosis,
  overrideFootprint,
  overrideAnchor,
  setOverrideFootprint,
  setOverrideAnchor,
}) {
  const diagnosis = latestDiagnosis?.data;
  const hasDiagnosis = latestDiagnosis?.available && diagnosis;

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
    </div>
  );
}

export default UploadPanel;

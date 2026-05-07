function UploadPanel({
  inputKey,
  selectedFile,
  previewUrl,
  handleFileChange,
  handleCreateItem,
  isCreatingItem,
}) {
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
        ) : null}
      </div>
    </div>
  );
}

export default UploadPanel;

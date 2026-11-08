const PAINT_STORAGE_KEY = "windows-paint-artwork-v1";

function restorePaintCanvas(canvas) {
  if (!canvas || canvas.dataset.paintRestoreStarted === "true") return;
  canvas.dataset.paintRestoreStarted = "true";

  let artwork;
  try {
    artwork = localStorage.getItem(PAINT_STORAGE_KEY);
  } catch {
    return;
  }
  if (!artwork) return;

  const image = new Image();
  image.onload = () => {
    if (!canvas.isConnected) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const pixelRatio = window.devicePixelRatio || 1;
    context.drawImage(image, 0, 0, canvas.width / pixelRatio, canvas.height / pixelRatio);
  };
  image.src = artwork;
}

function savePaintCanvas(canvas) {
  if (!canvas || !canvas.isConnected) return;

  try {
    localStorage.setItem(PAINT_STORAGE_KEY, canvas.toDataURL("image/png"));
  } catch {
    if (typeof notify === "function") {
      notify("画作保存失败，浏览器存储空间可能已满");
    }
  }
}

function initializePaintStorage(root = document) {
  root.querySelectorAll?.("canvas.paint-canvas").forEach(canvas => {
    restorePaintCanvas(canvas);
    if (canvas.dataset.paintStorageBound === "true") return;
    canvas.dataset.paintStorageBound = "true";

    canvas.addEventListener("pointerup", () => savePaintCanvas(canvas));
    canvas.addEventListener("pointercancel", () => savePaintCanvas(canvas));
    canvas.addEventListener("lostpointercapture", () => savePaintCanvas(canvas));
  });
}

initializePaintStorage();

if (typeof MutationObserver !== "undefined") {
  const paintStorageObserver = new MutationObserver(records => {
    records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) initializePaintStorage(node);
      });
    });
  });
  paintStorageObserver.observe(document.documentElement, { childList: true, subtree: true });
}

document.addEventListener("click", event => {
  const clearButton = event.target.closest(".paint-wrap [data-clear]");
  if (!clearButton) return;

  try {
    localStorage.removeItem(PAINT_STORAGE_KEY);
  } catch {
    // The canvas is still cleared in the paint app; storage may be unavailable.
  }
});

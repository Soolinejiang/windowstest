const PAINT_DESKTOP_SAVE_BUTTON = "paintSaveToDesktop";
const PAINT_IMAGE_DB_NAME = "windows-web-paint-files";
const PAINT_IMAGE_STORE = "images";

function openPaintImageDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("浏览器不支持 IndexedDB"));
      return;
    }

    const request = indexedDB.open(PAINT_IMAGE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PAINT_IMAGE_STORE)) {
        database.createObjectStore(PAINT_IMAGE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开画作存储"));
  });
}

async function storePaintImage(imageKey, blob) {
  const database = await openPaintImageDB();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(PAINT_IMAGE_STORE, "readwrite");
      transaction.objectStore(PAINT_IMAGE_STORE).put(blob, imageKey);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("保存画作失败"));
      transaction.onabort = () => reject(transaction.error || new Error("保存画作失败"));
    });
  } finally {
    database.close();
  }
}

async function loadPaintImage(imageKey) {
  const database = await openPaintImageDB();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(PAINT_IMAGE_STORE, "readonly")
        .objectStore(PAINT_IMAGE_STORE)
        .get(imageKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("读取画作失败"));
    });
  } finally {
    database.close();
  }
}

async function deletePaintImage(imageKey) {
  const database = await openPaintImageDB();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(PAINT_IMAGE_STORE, "readwrite");
      transaction.objectStore(PAINT_IMAGE_STORE).delete(imageKey);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("清理画作失败"));
      transaction.onabort = () => reject(transaction.error || new Error("清理画作失败"));
    });
  } finally {
    database.close();
  }
}

function makePaintFileName() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `画作-${timestamp}`;
  let name = `${baseName}.png`;
  let suffix = 2;
  while (fs.children.some(item => item.name.toLowerCase() === name.toLowerCase())) {
    name = `${baseName} (${suffix++}).png`;
  }
  return name;
}

async function savePaintToDesktop(canvas) {
  if (!canvas || !canvas.isConnected) return;

  let imageData;
  let blob;
  try {
    imageData = canvas.toDataURL("image/png");
    blob = await (await fetch(imageData)).blob();
  } catch {
    notify("无法导出画作，请重试");
    return;
  }

  const fileName = makePaintFileName();
  const imageKey = `paint-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const savedFile = file(fileName);
  savedFile.imageKey = imageKey;

  try {
    // Keep image bytes in IndexedDB; localStorage is only used for the small file metadata.
    await storePaintImage(imageKey, blob);
    fs.children.push(savedFile);
    try {
      saveFS();
    } catch (error) {
      fs.children = fs.children.filter(item => item !== savedFile);
      throw error;
    }
  } catch {
    try {
      await deletePaintImage(imageKey);
    } catch {
      // Ignore cleanup errors; report that the desktop save did not complete.
    }
    notify("保存到虚拟桌面失败，请检查浏览器存储权限或空间");
    return;
  }

  // Keep the existing PNG download behavior as a separate export.
  const link = document.createElement("a");
  link.href = imageData;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  renderDesktop();
  refreshExplorerWindows();
  notify("画作已保存到虚拟桌面，并已下载 PNG 文件");
}

function addPaintSaveButton(root = document) {
  root.querySelectorAll?.(".paint-wrap").forEach(paintWrap => {
    const toolbar = paintWrap.querySelector(".paint-toolbar");
    const canvas = paintWrap.querySelector("canvas.paint-canvas");
    if (!toolbar || !canvas || toolbar.querySelector(`#${PAINT_DESKTOP_SAVE_BUTTON}`)) return;

    const button = document.createElement("button");
    button.id = PAINT_DESKTOP_SAVE_BUTTON;
    button.type = "button";
    button.textContent = "保存到桌面";
    button.addEventListener("click", () => savePaintToDesktop(canvas));
    toolbar.appendChild(button);
  });
}

addPaintSaveButton();

if (typeof MutationObserver !== "undefined") {
  const paintSaveObserver = new MutationObserver(records => {
    records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) addPaintSaveButton(node);
      });
    });
  });
  paintSaveObserver.observe(document.documentElement, { childList: true, subtree: true });
}

// Open saved PNG files from the virtual desktop in the existing notepad window.
const renderNotepadWithoutPaintImage = renderNotepad;
renderNotepad = function (fileId) {
  const savedFile = findNode(fileId);
  if (!savedFile?.imageKey) return renderNotepadWithoutPaintImage(fileId);

  return `
    <div style="width:100%;height:100%;display:grid;place-items:center;overflow:auto;padding:16px;background:#f7f8fb;">
      <img data-paint-image="${savedFile.imageKey}" alt="${escapeHTML(savedFile.name)}" style="display:block;max-width:100%;max-height:100%;object-fit:contain;" />
    </div>
  `;
};

const bindAppContentEventsWithoutPaintImage = bindAppContentEvents;
bindAppContentEvents = function (appName, win) {
  bindAppContentEventsWithoutPaintImage(appName, win);
  if (appName !== "notepad") return;

  const image = win.querySelector("[data-paint-image]");
  if (!image) return;

  loadPaintImage(image.dataset.paintImage).then(blob => {
    if (blob && image.isConnected) image.src = URL.createObjectURL(blob);
  }).catch(() => {
    if (image.isConnected) notify("无法读取这幅画作");
  });
};

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
  if (!imageKey) return;
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

function visitPaintFiles(node, callback) {
  if (!node) return;
  if (node.type === "folder") {
    (node.children || []).forEach(child => visitPaintFiles(child, callback));
  } else {
    callback(node);
  }
}

async function migrateLegacyPaintFiles() {
  const legacyFiles = [];
  visitPaintFiles(fs, item => {
    if (typeof item.content === "string" && item.content.startsWith("data:image/") && !item.imageKey) {
      legacyFiles.push(item);
    }
  });
  if (!legacyFiles.length) return;

  const migrated = [];
  try {
    for (const item of legacyFiles) {
      const blob = await (await fetch(item.content)).blob();
      const imageKey = `paint-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await storePaintImage(imageKey, blob);
      migrated.push({ item, imageKey, content: item.content });
      item.imageKey = imageKey;
      item.content = "";
    }
    saveFS();
  } catch (error) {
    migrated.forEach(({ item, imageKey, content }) => {
      item.imageKey = undefined;
      item.content = content;
      deletePaintImage(imageKey).catch(() => {});
    });
    throw error;
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

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("无法生成画作文件"));
    }, "image/png");
  });
}

async function savePaintToDesktop(canvas) {
  if (!canvas || !canvas.isConnected) return;

  let blob;
  try {
    blob = await canvasToBlob(canvas);
    await migrateLegacyPaintFiles();
  } catch {
    notify("无法保存画作，请检查浏览器存储空间后重试");
    return;
  }

  const fileName = makePaintFileName();
  const imageKey = `paint-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const savedFile = file(fileName);
  savedFile.imageKey = imageKey;

  try {
    // Store image bytes separately so large PNGs do not exhaust localStorage.
    await storePaintImage(imageKey, blob);
    fs.children.push(savedFile);
    try {
      saveFS();
    } catch (error) {
      fs.children = fs.children.filter(item => item !== savedFile);
      throw error;
    }
  } catch {
    deletePaintImage(imageKey).catch(() => {});
    notify("保存到虚拟桌面失败，请检查浏览器存储权限或空间");
    return;
  }

  const imageUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = imageUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);

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

function setPaintFileNodeIds(root = document) {
  root.querySelectorAll?.(".file-item[data-file-id]").forEach(item => {
    item.dataset.nodeId = item.dataset.fileId;
  });
}

function enablePaintFileContextMenu() {
  document.addEventListener("contextmenu", event => {
    const fileItem = event.target.closest(".file-item[data-file-id]");
    const desktopFile = event.target.closest(".desktop-icon[data-node-id]");
    const item = fileItem || desktopFile;
    if (!item) return;

    const nodeId = item.dataset.nodeId || item.dataset.fileId;
    if (!nodeId || !findNode(nodeId)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    showNodeContextMenu(nodeId, event.clientX, event.clientY);
  }, true);
}

addPaintSaveButton();
setPaintFileNodeIds();
enablePaintFileContextMenu();

if (typeof MutationObserver !== "undefined") {
  const paintSaveObserver = new MutationObserver(records => {
    records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          addPaintSaveButton(node);
          setPaintFileNodeIds(node);
        }
      });
    });
  });
  paintSaveObserver.observe(document.documentElement, { childList: true, subtree: true });
}

// Keep the app's normal text-file editor while rendering saved paint files as images.
const renderNotepadWithoutPaintImage = renderNotepad;
renderNotepad = function (fileId) {
  const savedFile = findNode(fileId);
  if (!savedFile?.imageKey && !(typeof savedFile?.content === "string" && savedFile.content.startsWith("data:image/"))) {
    return renderNotepadWithoutPaintImage(fileId);
  }

  return `
    <div style="width:100%;height:100%;display:grid;place-items:center;overflow:auto;padding:16px;background:#f7f8fb;">
      <img data-paint-image="${escapeHTML(savedFile.imageKey || "")}" data-legacy-paint-image="${savedFile.imageKey ? "" : escapeHTML(savedFile.content)}" alt="${escapeHTML(savedFile.name)}" style="display:block;max-width:100%;max-height:100%;object-fit:contain;" />
    </div>
  `;
};

const bindAppContentEventsWithoutPaintImage = bindAppContentEvents;
bindAppContentEvents = function (appName, win) {
  bindAppContentEventsWithoutPaintImage(appName, win);
  if (appName !== "notepad") return;

  const image = win.querySelector("[data-paint-image]");
  if (!image) return;

  const legacyImage = image.dataset.legacyPaintImage;
  if (legacyImage) {
    image.src = legacyImage;
    return;
  }

  loadPaintImage(image.dataset.paintImage).then(blob => {
    if (blob && image.isConnected) {
      const objectUrl = URL.createObjectURL(blob);
      image.onload = () => URL.revokeObjectURL(objectUrl);
      image.src = objectUrl;
    }
  }).catch(() => {
    if (image.isConnected) notify("无法读取这幅画作");
  });
};

// Remove IndexedDB image data when a saved drawing is deleted from the virtual desktop.
const handleContextActionWithoutPaintCleanup = handleContextAction;
handleContextAction = function (action, nodeId) {
  const target = action === "delete" ? findNode(nodeId) : null;
  const imageKey = target?.imageKey;
  handleContextActionWithoutPaintCleanup(action, nodeId);

  if (imageKey && !findNode(nodeId)) {
    deletePaintImage(imageKey).catch(() => {
      notify("文件已从虚拟桌面删除，但图片数据清理失败");
    });
  }
};

// Move any older, oversized data-URL paintings out of localStorage on startup.
migrateLegacyPaintFiles().catch(() => {
  // Leave the original data intact if migration cannot complete; saving will show an error.
});

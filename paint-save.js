const PAINT_DESKTOP_SAVE_BUTTON = "paintSaveToDesktop";

function savePaintToDesktop(canvas) {
  if (!canvas || !canvas.isConnected) return;

  let imageData;
  try {
    imageData = canvas.toDataURL("image/png");
  } catch {
    notify("无法导出画作，请重试");
    return;
  }

  const fileName = `画作-${new Date().toLocaleString("zh-CN", { hour12: false }).replace(/[\\/:\s]/g, "-")}.png`;

  // Download a PNG so the artwork is available outside the simulated desktop too.
  const link = document.createElement("a");
  link.href = imageData;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Also save it as a file in the simulated desktop's root folder.
  const savedFile = file(fileName, imageData);
  fs.children.push(savedFile);
  try {
    saveFS();
    renderDesktop();
    refreshExplorerWindows();
    notify("画作已保存到桌面，并已下载 PNG 文件");
  } catch {
    fs.children = fs.children.filter(item => item !== savedFile);
    notify("PNG 已下载，但保存到网页桌面失败（存储空间可能已满）");
  }
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

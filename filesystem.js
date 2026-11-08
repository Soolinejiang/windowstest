function id() {
  return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function folder(name, children = []) {
  return { id: id(), name, type: "folder", children };
}

function file(name, content = "") {
  return { id: id(), name, type: "file", content };
}

function readJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveFS() {
  localStorage.setItem("windows-fs-v2", JSON.stringify(fs));
}

function defaultFS() {
  return folder("桌面", [
    folder("文档", [
      file("欢迎.txt", "欢迎使用 Windows Web。"),
      file("说明.md", "# Windows Web\n\n这是一个仿 Windows 的网页桌面。")
    ]),
    folder("下载", [
      file("sample.txt", "sample")
    ]),
    folder("图片", [
      file("wallpaper.png", "image-data")
    ]),
    folder("视频"),
    folder("音乐"),
    folder("开发", [
      file("index.html", "<html></html>"),
      file("app.js", "console.log('hello');")
    ]),
    folder("工具")
  ]);
}

let fs = readJSON("windows-fs-v2", null);

if (!fs || fs.type !== "folder" || !Array.isArray(fs.children)) {
  fs = defaultFS();
  saveFS();
}

function findNode(nodeId, node = fs) {
  if (!node) return null;
  if (node.id === nodeId) return node;

  if (node.type === "folder") {
    for (const child of node.children || []) {
      const found = findNode(nodeId, child);
      if (found) return found;
    }
  }

  return null;
}

function findParent(nodeId, node = fs) {
  if (!node || node.type !== "folder") return null;

  for (const child of node.children || []) {
    if (child.id === nodeId) return node;
    const found = findParent(nodeId, child);
    if (found) return found;
  }

  return null;
}

function createNode(parentId, type, name) {
  const parent = findNode(parentId);
  if (!parent || parent.type !== "folder") return null;

  const node = type === "folder" ? folder(name) : file(name);

  parent.children.push(node);
  saveFS();
  return node;
}

function renameNode(nodeId, newName) {
  const node = findNode(nodeId);
  if (!node || !newName.trim()) return false;
  node.name = newName.trim();
  saveFS();
  return true;
}

function deleteNode(nodeId) {
  const parent = findParent(nodeId);
  if (!parent) return false;

  const index = parent.children.findIndex(item => item.id === nodeId);
  if (index < 0) return false;

  parent.children.splice(index, 1);
  saveFS();
  return true;
}
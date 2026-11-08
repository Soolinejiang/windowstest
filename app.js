(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const FS_KEY = "windows-web-files-v1";
  const TRASH_KEY = "windows-web-trash-v1";
  const SETTINGS_KEY = "windows-web-settings-v1";

  const APPS = {
    explorer: { title: "文件资源管理器", icon: "📂" },
    browser: { title: "浏览器", icon: "🌐" },
    notepad: { title: "记事本", icon: "📄" },
    calculator: { title: "计算器", icon: "🧮" },
    paint: { title: "画图", icon: "🎨" },
    terminal: { title: "终端", icon: "⌨️" },
    minesweeper: { title: "扫雷", icon: "💣" },
    calendar: { title: "日历", icon: "📅" },
    media: { title: "音乐播放器", icon: "🎵" },
    taskmgr: { title: "任务管理器", icon: "📊" },
    settings: { title: "设置", icon: "⚙️" },
    trash: { title: "回收站", icon: "🗑️" },
    photos: { title: "照片查看器", icon: "🖼️" },
    about: { title: "关于 Windows Web", icon: "ℹ️" }
  };

  const BOOKMARKS = [
    { icon: "🚪", name: "后室游戏", url: "https://soolinejiang.github.io/backroom/" },
    { icon: "🏫", name: "班级网站", url: "http://soolinesauce.dpdns.org/" },
    { icon: "⛅", name: "天气预报", url: "https://soolinejiang.github.io/tqyb/" },
    { icon: "🌟", name: "soolineの个人站", url: "https://cnman.gt.tc" }
  ];

  const windows = new Map();
  const settings = loadJSON(SETTINGS_KEY, { dark: false, wallpaper: "blue" });

  let fs = loadJSON(FS_KEY, null);
  let trash = loadJSON(TRASH_KEY, []);
  let clipboard = null;
  let zIndex = 100;
  let toastTimer = null;
  let contextState = null;

  if (!isValidFolder(fs)) fs = createInitialFS();
  if (!Array.isArray(trash)) trash = [];

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    applySettings();
    renderDesktop();
    renderAppGrid();
    bindGlobalEvents();
    updateClock();
    window.setInterval(updateClock, 1000);
    openApp("explorer");
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function save() {
    try {
      localStorage.setItem(FS_KEY, JSON.stringify(fs));
      localStorage.setItem(TRASH_KEY, JSON.stringify(trash));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      notify("浏览器存储空间不足，无法保存更改");
    }
  }

  function isValidFolder(node) {
    return Boolean(
      node &&
      node.type === "folder" &&
      Array.isArray(node.children)
    );
  }

  function makeId() {
    return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function folder(name, children = []) {
    return { id: makeId(), name, type: "folder", children };
  }

  function file(name, content = "") {
    return { id: makeId(), name, type: "file", content };
  }

  function createInitialFS() {
    return folder("此电脑", [
      folder("桌面", [
        folder("新建文件夹"),
        file("欢迎使用.txt", "欢迎使用 Windows Web 桌面！\n\n你可以在桌面创建文件和文件夹。")
      ]),
      folder("文档", [
        file("说明.txt", "这是 Windows Web 桌面的文档目录。")
      ]),
      folder("下载"),
      folder("图片"),
      folder("音乐"),
      folder("视频"),
      folder("本地磁盘 (C:)"),
      folder("本地磁盘 (D:)")
    ]);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
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

  function getDesktopFolder() {
    return fs.children.find(item =>
      item.type === "folder" && item.name === "桌面"
    ) || fs;
  }

  function getIcon(node) {
    if (node.type === "folder") return "📁";
    if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(node.name)) return "🖼️";
    if (/\.txt$/i.test(node.name)) return "📄";
    return "📃";
  }

  function applySettings() {
    document.body.classList.toggle("dark", Boolean(settings.dark));
    document.body.classList.remove("wall-purple", "wall-green");

    if (settings.wallpaper === "purple") {
      document.body.classList.add("wall-purple");
    } else if (settings.wallpaper === "green") {
      document.body.classList.add("wall-green");
    }
  }

  function notify(message) {
    const toast = $("#toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);

    toastTimer = window.setTimeout(() => {
      toast.classList.remove("show");
    }, 2300);
  }

  function renderDesktop() {
    const desktop = $("#desktop");
    if (!desktop) return;

    const appIcons = Object.entries(APPS).map(([name, app]) => `
      <div class="desktop-icon" data-app-icon="${escapeHTML(name)}" title="双击打开${escapeHTML(app.title)}">
        <span class="icon">${escapeHTML(app.icon)}</span>
        <span>${escapeHTML(app.title)}</span>
      </div>
    `).join("");

    const fileIcons = (getDesktopFolder().children || []).map(node => `
      <div class="desktop-icon" data-node-id="${escapeHTML(node.id)}" title="${escapeHTML(node.name)}">
        <span class="icon">${getIcon(node)}</span>
        <span>${escapeHTML(node.name)}</span>
      </div>
    `).join("");

    desktop.innerHTML = appIcons + fileIcons;
  }

  function renderAppGrid() {
    const grid = $("#appGrid");
    if (!grid) return;

    grid.innerHTML = Object.entries(APPS).map(([name, app]) => `
      <button
        class="app-item"
        data-app-launch="${escapeHTML(name)}"
        data-name="${escapeHTML(app.title)}"
        type="button">
        <span class="icon">${escapeHTML(app.icon)}</span>
        <span>${escapeHTML(app.title)}</span>
      </button>
    `).join("");
  }

  function renderTaskbar() {
    const container = $("#taskButtons");
    if (!container) return;

    const focusedApp = $(".window.focused")?.dataset.app;

    container.innerHTML = [...windows.keys()].map(name => {
      const app = APPS[name];
      if (!app) return "";

      return `
        <button class="task-btn ${name === focusedApp ? "active" : ""}"
                data-task-app="${escapeHTML(name)}"
                type="button"
                title="${escapeHTML(app.title)}">
          <span>${escapeHTML(app.icon)}</span>
          <span class="title">${escapeHTML(app.title)}</span>
        </button>
      `;
    }).join("");

    $$("[data-launch]").forEach(button => {
      const win = windows.get(button.dataset.launch);
      button.classList.toggle("open", Boolean(win));
      button.classList.toggle("active", Boolean(win && !win.classList.contains("minimized")));
    });
  }

  function bindGlobalEvents() {
    $("#startButton")?.addEventListener("click", event => {
      event.stopPropagation();
      const startMenu = $("#startMenu");
      const shouldShow = !startMenu.classList.contains("show");

      closePanels();
      startMenu.classList.toggle("show", shouldShow);
    });

    $("#quickButton")?.addEventListener("click", event => {
      event.stopPropagation();
      const panel = $("#quickPanel");
      const shouldShow = !panel.classList.contains("show");

      closePanels();
      panel.classList.toggle("show", shouldShow);
    });

    $("#clockButton")?.addEventListener("click", event => {
      event.stopPropagation();
      const panel = $("#notifications");
      const shouldShow = !panel.classList.contains("show");

      closePanels();
      panel.classList.toggle("show", shouldShow);
    });

    $("#taskSearch")?.addEventListener("click", () => {
      closePanels();
      $("#startMenu").classList.add("show");
      $("#startSearch")?.focus();
    });

    $("#startSearch")?.addEventListener("input", event => {
      const query = event.target.value.trim().toLowerCase();

      $$(".app-item").forEach(item => {
        item.style.display = item.dataset.name.toLowerCase().includes(query)
          ? ""
          : "none";
      });
    });

    $("#taskSearchInput")?.addEventListener("input", event => {
      const query = event.target.value.trim().toLowerCase();

      $$(".app-item").forEach(item => {
        item.style.display = item.dataset.name.toLowerCase().includes(query)
          ? ""
          : "none";
      });

      closePanels();
      $("#startMenu").classList.add("show");
    });

    $("#allApps")?.addEventListener("click", () => {
      $("#startSearch").value = "";
      $$(".app-item").forEach(item => item.style.display = "");
      $("#startSearch").focus();
    });

    $("#clearNotifications")?.addEventListener("click", () => {
      $("#notificationCard").textContent = "没有新的通知。";
    });

    $("#powerButton")?.addEventListener("click", () => {
      notify("这是网页模拟器，不能真的关机");
    });

    $("#quickPanel")?.addEventListener("click", event => {
      const tile = event.target.closest(".quick-tile");
      if (tile) tile.classList.toggle("on");
    });

    $("#appGrid")?.addEventListener("click", event => {
      const button = event.target.closest("[data-app-launch]");
      if (!button) return;
      openApp(button.dataset.appLaunch);
    });

    $("#desktop")?.addEventListener("click", event => {
      const icon = event.target.closest(".desktop-icon");

      $$(".desktop-icon.selected").forEach(item => {
        item.classList.remove("selected");
      });

      if (icon) icon.classList.add("selected");
    });

    $("#desktop")?.addEventListener("dblclick", event => {
      const icon = event.target.closest(".desktop-icon");
      if (!icon) return;

      if (icon.dataset.appIcon) {
        openApp(icon.dataset.appIcon);
      } else if (icon.dataset.nodeId) {
        openNode(icon.dataset.nodeId);
      }
    });

    document.addEventListener("click", event => {
      const contextButton = event.target.closest("[data-context-action]");
      if (contextButton) {
        handleContextAction(contextButton.dataset.contextAction);
        return;
      }

      const appButton = event.target.closest("[data-app-launch]");
      if (appButton) {
        openApp(appButton.dataset.appLaunch);
        return;
      }

      const taskButton = event.target.closest("[data-task-app]");
      if (taskButton) {
        const win = windows.get(taskButton.dataset.taskApp);
        if (win) {
          win.classList.remove("minimized");
          win.classList.add("show");
          focusWindow(win);
        }
        return;
      }

      if (!event.target.closest(".context-menu")) {
        $("#contextMenu")?.classList.remove("show");
      }

      if (!event.target.closest("#startMenu") &&
          !event.target.closest("#startButton") &&
          !event.target.closest("#taskSearch")) {
        $("#startMenu")?.classList.remove("show");
      }

      if (!event.target.closest("#quickPanel") &&
          !event.target.closest("#quickButton")) {
        $("#quickPanel")?.classList.remove("show");
      }

      if (!event.target.closest("#notifications") &&
          !event.target.closest("#clockButton")) {
        $("#notifications")?.classList.remove("show");
      }
    });

    document.addEventListener("contextmenu", event => {
      const fileItem = event.target.closest("[data-node-id]");
      if (fileItem) {
        event.preventDefault();
        showNodeContextMenu(fileItem.dataset.nodeId, event.clientX, event.clientY);
        return;
      }

      if (event.target.closest("#desktop")) {
        event.preventDefault();
        showDesktopContextMenu(event.clientX, event.clientY);
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closePanels();

      if (event.key === "Enter" && event.target === $("#startSearch")) {
        const first = $$(".app-item").find(item => item.style.display !== "none");
        if (first) openApp(first.dataset.appLaunch);
      }

      if (event.key === "Delete") {
        const win = $(".window.focused");
        if (win?.dataset.selectedFile) {
          deleteNodeToTrash(win.dataset.selectedFile);
          renderAllFileViews();
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        const selected = $(".window.focused")?.dataset.selectedFile;
        if (selected) setClipboard(selected, "copy");
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") {
        const selected = $(".window.focused")?.dataset.selectedFile;
        if (selected) setClipboard(selected, "cut");
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        const win = $(".window.focused");
        if (win?.dataset.app === "explorer") {
          pasteInto(win.dataset.folderId || fs.id);
        }
      }
    });
  }

  function closePanels() {
    $$(".panel").forEach(panel => panel.classList.remove("show"));
    $("#contextMenu")?.classList.remove("show");
  }

  function showMenu(html, x, y) {
    const menu = $("#contextMenu");
    if (!menu) return;

    menu.innerHTML = html;
    menu.classList.add("show");

    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(4, Math.min(x, innerWidth - rect.width - 4))}px`;
      menu.style.top = `${Math.max(4, Math.min(y, innerHeight - rect.height - 4))}px`;
    });
  }

  function showDesktopContextMenu(x, y) {
    contextState = { type: "desktop" };

    const pasteButton = clipboard
      ? `<button type="button" data-context-action="paste">粘贴</button>`
      : "";

    showMenu(`
      <button type="button" data-context-action="new-folder">新建文件夹</button>
      <button type="button" data-context-action="new-file">新建文本文件</button>
      ${pasteButton}
      <div class="separator"></div>
      <button type="button" data-context-action="refresh">刷新桌面</button>
    `, x, y);
  }

  function showNodeContextMenu(nodeId, x, y) {
    const node = findNode(nodeId);
    if (!node) return;

    contextState = { type: "node", nodeId };

    const pasteButton = node.type === "folder" && clipboard
      ? `<button type="button" data-context-action="paste">粘贴到此文件夹</button>`
      : "";

    showMenu(`
      <button type="button" data-context-action="open">打开</button>
      <button type="button" data-context-action="rename">重命名</button>
      <button type="button" data-context-action="copy">复制</button>
      <button type="button" data-context-action="cut">剪切</button>
      <button type="button" data-context-action="delete">删除</button>
      ${pasteButton}
    `, x, y);
  }

  function handleContextAction(action) {
    $("#contextMenu")?.classList.remove("show");

    const nodeId = contextState?.nodeId;
    const node = nodeId ? findNode(nodeId) : null;

    switch (action) {
      case "new-folder":
      case "new-file": {
        const isFolder = action === "new-folder";
        const defaultName = isFolder ? "新建文件夹" : "新建文件.txt";
        const name = prompt(isFolder ? "文件夹名称：" : "文件名：", defaultName);
        if (!name?.trim()) return;

        const created = createNode(
          getDesktopFolder().id,
          isFolder ? "folder" : "file",
          name.trim()
        );

        if (created) {
          save();
          renderAllFileViews();
          notify(isFolder ? "文件夹已创建" : "文件已创建");
        }
        break;
      }

      case "refresh":
        renderAllFileViews();
        notify("桌面已刷新");
        break;

      case "open":
        if (node) openNode(node.id);
        break;

      case "rename":
        if (node) renameNodeByPrompt(node);
        break;

      case "copy":
        if (node) setClipboard(node.id, "copy");
        break;

      case "cut":
        if (node) setClipboard(node.id, "cut");
        break;

      case "delete":
        if (node && confirm(`确定删除“${node.name}”吗？`)) {
          deleteNodeToTrash(node.id);
          renderAllFileViews();
          notify("已移到回收站");
        }
        break;

      case "paste": {
        let targetId = getDesktopFolder().id;
        if (contextState?.type === "node" && node?.type === "folder") {
          targetId = node.id;
        }
        pasteInto(targetId);
        break;
      }

      default:
        break;
    }

    contextState = null;
  }

  function createNode(parentId, type, name, content = "") {
    const parent = findNode(parentId);
    const cleanName = String(name || "").trim();

    if (!parent || parent.type !== "folder" || !cleanName) return null;
    if (parent.children.some(item => item.name.toLowerCase() === cleanName.toLowerCase())) {
      notify("该位置已经存在同名项目");
      return null;
    }

    const node = type === "folder" ? folder(cleanName) : file(cleanName, content);
    parent.children.push(node);
    return node;
  }

  function renameNodeByPrompt(node) {
    const parent = findParent(node.id);
    if (!parent) return;

    const name = prompt("请输入新名称：", node.name);
    if (name === null) return;

    const cleanName = name.trim();
    if (!cleanName) return notify("名称不能为空");

    if (parent.children.some(item =>
      item.id !== node.id && item.name.toLowerCase() === cleanName.toLowerCase()
    )) {
      return notify("该目录中已有同名项目");
    }

    node.name = cleanName;
    save();
    renderAllFileViews();
    notify("已重命名");
  }

  function deleteNodeToTrash(nodeId) {
    const parent = findParent(nodeId);
    if (!parent) return false;

    const index = parent.children.findIndex(item => item.id === nodeId);
    if (index < 0) return false;

    const [node] = parent.children.splice(index, 1);
    trash.push({ node, parentId: parent.id, deletedAt: Date.now() });
    save();
    return true;
  }

  function setClipboard(nodeId, mode) {
    if (!findNode(nodeId)) return;
    clipboard = { nodeId, mode };
    notify(mode === "copy" ? "已复制" : "已剪切");
  }

  function pasteInto(targetId) {
    if (!clipboard) return notify("剪贴板为空");

    const source = findNode(clipboard.nodeId);
    const target = findNode(targetId);

    if (!source || !target || target.type !== "folder") {
      clipboard = null;
      return notify("无法粘贴到此位置");
    }

    if (source.id === target.id || (source.type === "folder" && containsNode(source, target.id))) {
      return notify("不能将文件夹粘贴到自身或其子文件夹中");
    }

    if (target.children.some(item => item.name.toLowerCase() === source.name.toLowerCase())) {
      return notify("目标文件夹中已有同名项目");
    }

    if (clipboard.mode === "cut") {
      const parent = findParent(source.id);
      if (!parent) return;
      parent.children = parent.children.filter(item => item.id !== source.id);
      target.children.push(source);
    } else {
      target.children.push(cloneNode(source));
    }

    clipboard = null;
    save();
    renderAllFileViews();
    notify("已粘贴");
  }

  function containsNode(root, targetId) {
    if (root.id === targetId) return true;
    return root.type === "folder" &&
      root.children.some(child => containsNode(child, targetId));
  }

  function cloneNode(node) {
    const copy = { ...node, id: makeId() };
    if (node.type === "folder") copy.children = node.children.map(cloneNode);
    return copy;
  }

  function restoreTrashItem(nodeId) {
    const index = trash.findIndex(entry => entry.node.id === nodeId);
    if (index < 0) return false;

    const entry = trash[index];
    let parent = findNode(entry.parentId);
    if (!parent || parent.type !== "folder") parent = getDesktopFolder();

    if (parent.children.some(item => item.name.toLowerCase() === entry.node.name.toLowerCase())) {
      entry.node.name = `恢复的 ${entry.node.name}`;
    }

    parent.children.push(entry.node);
    trash.splice(index, 1);
    save();
    renderAllFileViews();
    notify("文件已还原");
    return true;
  }

  function emptyTrash() {
    if (!trash.length) return notify("回收站已经是空的");
    if (!confirm("确定永久删除回收站中的所有项目吗？")) return;

    trash = [];
    save();
    renderAllFileViews();
    notify("回收站已清空");
  }

  function renderAllFileViews() {
    renderDesktop();

    for (const win of windows.values()) {
      if (win.dataset.app === "explorer") renderExplorer(win);
      if (win.dataset.app === "trash") renderTrash(win);
    }
  }

  function openNode(nodeId) {
    const node = findNode(nodeId);
    if (!node) return;

    if (node.type === "folder") {
      openApp("explorer", { folderId: node.id });
    } else if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(node.name)) {
      openApp("photos", { fileId: node.id });
    } else {
      openApp("notepad", { fileId: node.id });
    }
  }

  function createWindow(appName) {
    const app = APPS[appName];
    const win = document.createElement("section");

    win.className = "window show";
    win.dataset.app = appName;
    win.style.top = `${65 + windows.size * 18}px`;
    win.style.left = `calc(50% + ${Math.min(windows.size * 14, 70)}px)`;
    win.style.zIndex = String(++zIndex);

    win.innerHTML = `
      <header class="titlebar">
        <div class="window-title">
          <span>${escapeHTML(app.icon)}</span>
          <span>${escapeHTML(app.title)}</span>
        </div>
        <div class="window-controls">
          <button data-window-action="minimize" title="最小化" type="button">—</button>
          <button data-window-action="maximize" title="最大化" type="button">□</button>
          <button class="close" data-window-action="close" title="关闭" type="button">×</button>
        </div>
      </header>
      <div class="window-content"></div>
    `;

    document.body.appendChild(win);
    windows.set(appName, win);
    bindWindow(win);

    return win;
  }

  function openApp(appName, options = {}) {
    if (!APPS[appName]) return;

    closePanels();

    let win = windows.get(appName);
    if (!win) {
      win = createWindow(appName);
      renderWindowContent(win);
    } else {
      win.classList.remove("minimized");
      win.classList.add("show");
    }

    if (appName === "explorer" && options.folderId) {
      showFolder(win, options.folderId);
    } else if (appName === "notepad" && options.fileId) {
      loadTextFile(win, options.fileId);
    } else if (appName === "photos" && options.fileId) {
      loadPhoto(win, options.fileId);
    }

    focusWindow(win);
    renderTaskbar();
  }

  function closeApp(win) {
    const appName = win.dataset.app;

    if (win._taskTimer) clearInterval(win._taskTimer);
    if (win._mediaStop) win._mediaStop();

    windows.delete(appName);
    win.remove();
    renderTaskbar();
  }

  function focusWindow(win) {
    $$(".window").forEach(item => item.classList.remove("focused"));
    win.classList.add("focused");
    win.style.zIndex = String(++zIndex);
    renderTaskbar();
  }

  function toggleMaximize(win) {
    const maximized = win.classList.toggle("maximized");

    if (!maximized) {
      win.style.top = win.dataset.restoreTop || "80px";
      win.style.left = win.dataset.restoreLeft || "50%";
      win.style.width = win.dataset.restoreWidth || "";
      win.style.height = win.dataset.restoreHeight || "";
      win.style.transform = "translateX(-50%)";
    }
  }

  function bindWindow(win) {
    const titlebar = $(".titlebar", win);
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    win.addEventListener("pointerdown", () => focusWindow(win));

    titlebar.addEventListener("pointerdown", event => {
      if (event.target.closest(".window-controls") || win.classList.contains("maximized")) return;

      dragging = true;
      const rect = win.getBoundingClientRect();

      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;

      win.style.left = `${rect.left}px`;
      win.style.top = `${rect.top}px`;
      win.style.transform = "none";

      titlebar.setPointerCapture(event.pointerId);
    });

    titlebar.addEventListener("pointermove", event => {
      if (!dragging) return;

      const maxLeft = Math.max(0, window.innerWidth - 80);
      const maxTop = Math.max(0, window.innerHeight - 80);

      win.style.left = `${Math.max(0, Math.min(event.clientX - offsetX, maxLeft))}px`;
      win.style.top = `${Math.max(0, Math.min(event.clientY - offsetY, maxTop))}px`;
    });

    titlebar.addEventListener("pointerup", () => dragging = false);
    titlebar.addEventListener("pointercancel", () => dragging = false);

    win.addEventListener("click", event => {
      const control = event.target.closest("[data-window-action]");
      if (control) {
        const action = control.dataset.windowAction;

        if (action === "close") closeApp(win);

        if (action === "minimize") {
          win.classList.add("minimized");
          win.classList.remove("focused");
          renderTaskbar();
        }

        if (action === "maximize") {
          if (!win.classList.contains("maximized")) {
            win.dataset.restoreTop = win.style.top;
            win.dataset.restoreLeft = win.style.left;
            win.dataset.restoreWidth = win.style.width;
            win.dataset.restoreHeight = win.style.height;
          }
          toggleMaximize(win);
        }
        return;
      }

      handleWindowClick(win, event);
    });

    win.addEventListener("dblclick", event => {
      const item = event.target.closest("[data-file-id]");
      if (item) openNode(item.dataset.fileId);
    });

    win.addEventListener("keydown", event => {
      if (event.target.matches("[data-browser-address]") && event.key === "Enter") {
        browserNavigate(win, event.target.value);
      }

      if (event.target.matches("[data-terminal-input]") && event.key === "Enter") {
        runTerminalCommand(win, event.target.value);
      }
    });

    win.addEventListener("input", event => {
      if (event.target.matches("[data-notepad]")) {
        const node = findNode(win.dataset.fileId);
        if (node) {
          node.content = event.target.value;
          save();
        }
      }

      if (event.target.matches("[data-explorer-search]")) {
        renderExplorer(win);
      }
    });

    win.addEventListener("contextmenu", event => {
      const cell = event.target.closest("[data-mine-cell]");
      if (cell && win.dataset.app === "minesweeper") {
        event.preventDefault();
        toggleMineFlag(win, Number(cell.dataset.mineCell));
        return;
      }

      const item = event.target.closest("[data-file-id]");
      if (item) {
        event.preventDefault();
        contextState = {
          type: "explorer-item",
          nodeId: item.dataset.fileId,
          folderId: win.dataset.folderId || fs.id
        };
        showMenu(`
          <button type="button" data-context-action="open">打开</button>
          <button type="button" data-context-action="rename">重命名</button>
          <button type="button" data-context-action="copy">复制</button>
          <button type="button" data-context-action="cut">剪切</button>
          <button type="button" data-context-action="delete">删除</button>
          <button type="button" data-context-action="paste">粘贴到此文件夹</button>
        `, event.clientX, event.clientY);
      }
    });

    if (win.dataset.app === "browser") initBrowser(win);
    if (win.dataset.app === "paint") initPaint(win);
    if (win.dataset.app === "minesweeper") initMinesweeper(win);
    if (win.dataset.app === "calendar") initCalendar(win);
    if (win.dataset.app === "taskmgr") initTaskManager(win);
    if (win.dataset.app === "media") initMedia(win);
    if (win.dataset.app === "explorer") {
      win.dataset.folderId = fs.id;
      renderExplorer(win);
    }
    if (win.dataset.app === "trash") renderTrash(win);
    if (win.dataset.app === "terminal") {
      setTimeout(() => $("[data-terminal-input]", win)?.focus(), 0);
    }
  }

  function renderWindowContent(win) {
    const appName = win.dataset.app;
    const content = $(".window-content", win);
    content.innerHTML = getAppContent(appName);
  }

  function handleWindowClick(win, event) {
    const appName = win.dataset.app;

    const launch = event.target.closest("[data-open-app]");
    if (launch) return openApp(launch.dataset.openApp);

    const nav = event.target.closest("[data-location]");
    if (nav && appName === "explorer") return navigateExplorer(win, nav.dataset.location);

    const command = event.target.closest("[data-explorer-command]");
    if (command) return explorerCommand(win, command.dataset.explorerCommand);

    const fileItem = event.target.closest("[data-file-id]");
    if (fileItem && appName === "explorer") {
      $$(".file-item", win).forEach(item => item.classList.remove("selected"));
      fileItem.classList.add("selected");
      win.dataset.selectedFile = fileItem.dataset.fileId;
      return;
    }

    const noteButton = event.target.closest("[data-note-command]");
    if (noteButton) return notepadCommand(win, noteButton.dataset.noteCommand);

    const calcButton = event.target.closest("[data-calc-key]");
    if (calcButton) return calculatorKey(win, calcButton.dataset.calcKey);

    const browserButton = event.target.closest("[data-browser-command]");
    if (browserButton) return browserCommand(win, browserButton.dataset.browserCommand);

    const bookmark = event.target.closest("[data-bookmark-url]");
    if (bookmark) return browserNavigate(win, bookmark.dataset.bookmarkUrl);

    const paintButton = event.target.closest("[data-paint-command]");
    if (paintButton) return paintCommand(win, paintButton.dataset.paintCommand);

    const mineRestart = event.target.closest("[data-mine-restart]");
    if (mineRestart) return initMinesweeper(win);

    const mineCell = event.target.closest("[data-mine-cell]");
    if (mineCell && appName === "minesweeper") {
      return openMineCell(win, Number(mineCell.dataset.mineCell));
    }

    const taskAction = event.target.closest("[data-task-command]");
    if (taskAction) {
      if (taskAction.dataset.taskCommand === "refresh") renderTaskManager(win);
      if (taskAction.dataset.taskCommand === "end") endTask(win);
      return;
    }

    const taskRow = event.target.closest("[data-task-app]");
    if (taskRow) {
      $$("[data-task-app]", win).forEach(row => row.classList.remove("selected"));
      taskRow.classList.add("selected");
      win.dataset.selectedTask = taskRow.dataset.taskApp;
      return;
    }

    const calButton = event.target.closest("[data-calendar-command]");
    if (calButton) {
      win._monthOffset += calButton.dataset.calendarCommand === "next" ? 1 : -1;
      renderCalendar(win);
      return;
    }

    const track = event.target.closest("[data-media-track]");
    if (track) return playTrack(win, Number(track.dataset.mediaTrack));

    if (event.target.closest("[data-media-stop]")) {
      win._mediaStop?.();
      return;
    }

    const themeButton = event.target.closest("[data-setting-theme]");
    if (themeButton) return toggleTheme();

    const wallpaperButton = event.target.closest("[data-wallpaper]");
    if (wallpaperButton) return setWallpaper(wallpaperButton.dataset.wallpaper);

    const trashButton = event.target.closest("[data-trash-command]");
    if (trashButton) {
      if (trashButton.dataset.trashCommand === "empty") emptyTrash();
      if (trashButton.dataset.trashCommand === "restore") restoreSelectedTrash(win);
    }
  }

  function getAppContent(name) {
    switch (name) {
      case "explorer":
        return `
          <div class="toolbar">
            <button class="tool" data-explorer-command="up" title="上一级" type="button">↑</button>
            <div class="address" data-explorer-address>📂 此电脑</div>
            <input class="address" data-explorer-search placeholder="搜索当前文件夹">
            <button class="tool" data-explorer-command="new-folder" title="新建文件夹" type="button">📁＋</button>
            <button class="tool" data-explorer-command="new-file" title="新建文本文件" type="button">📄＋</button>
            <button class="tool" data-explorer-command="refresh" title="刷新" type="button">⟳</button>
          </div>
          <div class="explorer-layout">
            <aside class="sidebar">
              <div class="nav-item selected" data-location="root">📂 此电脑</div>
              <div class="nav-item" data-location="desktop">🖥️ 桌面</div>
              <div class="nav-item" data-location="documents">📄 文档</div>
              <div class="nav-item" data-location="downloads">📥 下载</div>
              <div class="nav-item" data-location="pictures">🖼️ 图片</div>
              <div class="nav-item" data-location="trash">🗑️ 回收站</div>
            </aside>
            <div class="files-area" data-files-area></div>
          </div>`;

      case "browser":
        return `
          <div class="browser-wrap">
            <div class="toolbar browser-toolbar">
              <button class="tool" data-browser-command="back" title="后退" type="button">←</button>
              <button class="tool" data-browser-command="forward" title="前进" type="button">→</button>
              <button class="tool" data-browser-command="reload" title="刷新" type="button">⟳</button>
              <button class="tool" data-browser-command="home" title="主页" type="button">🏠</button>
              <input class="address" data-browser-address placeholder="输入网址，例如 example.com" spellcheck="false">
              <button class="tool" data-browser-command="go" type="button">前往</button>
              <button class="tool" data-browser-command="newtab" title="系统浏览器打开" type="button">↗</button>
            </div>
            <div class="browser-bookmarks">
              ${BOOKMARKS.map(item => `
                <button class="bm-card" type="button" data-bookmark-url="${escapeHTML(item.url)}">
                  <span class="bm-icon">${escapeHTML(item.icon)}</span>
                  <span class="bm-name">${escapeHTML(item.name)}</span>
                </button>
              `).join("")}
            </div>
            <iframe class="browser-frame" data-browser-frame title="浏览器页面" referrerpolicy="no-referrer"></iframe>
            <div class="browser-tip">部分网站禁止嵌入；若页面空白，可点 ↗ 在系统浏览器打开。</div>
          </div>`;

      case "notepad":
        return `
          <div class="notepad-wrap">
            <div class="notepad-menu">
              <button class="tool" data-note-command="new" type="button">新建</button>
              <button class="tool" data-note-command="save" type="button">保存</button>
              <span data-note-name>未命名.txt</span>
            </div>
            <textarea class="notepad-text" data-notepad spellcheck="false" placeholder="在此处输入文字…"></textarea>
          </div>`;

      case "calculator":
        return `
          <div class="calc">
            <input class="calc-display" data-calc-display value="0" readonly>
            <div class="calc-grid">
              ${["C", "⌫", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "±", "0", ".", "="]
                .map(key => `<button class="calc-key ${key === "=" ? "equals" : ""}" data-calc-key="${key}" type="button">${key}</button>`)
                .join("")}
            </div>
          </div>`;

      case "paint":
        return `
          <div class="paint-wrap">
            <div class="toolbar paint-controls">
              <button class="tool" data-paint-command="save" type="button">💾 保存到桌面</button>
              <button class="tool" data-paint-command="clear" type="button">清空</button>
              <label>颜色 <input type="color" data-paint-color value="#1a73e8"></label>
              <label>粗细 <input type="range" data-paint-size min="1" max="40" value="5"></label>
              <label><input type="checkbox" data-paint-eraser> 橡皮擦</label>
            </div>
            <div class="paint-canvas-area">
              <canvas class="paint-canvas" data-paint-canvas width="640" height="420"></canvas>
            </div>
          </div>`;

      case "terminal":
        return `
          <div class="terminal">
            <div class="term-output" data-terminal-output>Windows Web Terminal
输入 help 查看命令列表。
</div>
            <div class="term-row">
              <span class="term-prompt">C:\\Users\\用户&gt;</span>
              <input class="term-input" data-terminal-input autocomplete="off" spellcheck="false">
            </div>
          </div>`;

      case "minesweeper":
        return `
          <div class="mine-wrap">
            <div class="mine-status">
              <span data-mine-count>💣 10</span>
              <button class="tool" data-mine-restart type="button">🙂 重新开始</button>
              <span data-mine-time>⏱ 0 秒</span>
            </div>
            <div class="mine-grid" data-mine-grid></div>
            <p class="empty">左键翻开 · 右键插旗 · 找出全部 10 颗雷</p>
          </div>`;

      case "calendar":
        return `
          <div class="calendar">
            <div class="cal-head">
              <button class="tool" data-calendar-command="prev" type="button">←</button>
              <b data-calendar-title></b>
              <button class="tool" data-calendar-command="next" type="button">→</button>
            </div>
            <div class="cal-grid" data-calendar-grid></div>
          </div>`;

      case "media":
        return `
          <div class="media">
            <div class="media-now" data-media-now>
              <span class="disc">💿</span>
              <div data-media-title>未在播放</div>
            </div>
            <button class="media-track" data-media-track="0" type="button"><span>🎵 小星星</span><span>播放</span></button>
            <button class="media-track" data-media-track="1" type="button"><span>🎵 欢乐颂</span><span>播放</span></button>
            <button class="media-track" data-media-track="2" type="button"><span>🎵 简单旋律</span><span>播放</span></button>
            <button class="media-track" data-media-stop type="button"><span>⏹ 停止</span></button>
            <p class="empty">使用浏览器 Web Audio 合成声音。</p>
          </div>`;

      case "taskmgr":
        return `
          <div class="taskmgr">
            <table>
              <thead><tr><th>应用</th><th>CPU</th><th>内存</th><th>状态</th></tr></thead>
              <tbody data-task-body></tbody>
            </table>
            <div class="taskmgr-actions">
              <button class="small-button" data-task-command="end" type="button">结束任务</button>
              <button class="small-button" data-task-command="refresh" type="button">刷新</button>
            </div>
          </div>`;

      case "settings":
        return `
          <div class="settings">
            <h2>个性化</h2>
            <div class="setting-card">
              <b>明暗模式</b>
              <p>切换桌面的亮色或暗色主题。</p>
              <button data-setting-theme type="button">${settings.dark ? "切换到亮色模式" : "切换到暗色模式"}</button>
            </div>
            <div class="setting-card">
              <b>桌面壁纸</b>
              <p>选择桌面背景颜色主题。</p>
              <button data-wallpaper="blue" type="button">蓝色</button>
              <button data-wallpaper="purple" type="button">紫色</button>
              <button data-wallpaper="green" type="button">绿色</button>
            </div>
          </div>`;

      case "trash":
        return `
          <div class="toolbar">
            <button class="tool" data-trash-command="restore" type="button">还原选中项</button>
            <button class="tool" data-trash-command="empty" type="button">清空回收站</button>
          </div>
          <div class="files-area" data-trash-area></div>`;

      case "photos":
        return `<div class="photo-view"><img data-photo-image alt="图片预览"></div>`;

      case "about":
      default:
        return `
          <div class="settings">
            <h2>Windows Web 桌面</h2>
            <p>一个使用 HTML、CSS 和 JavaScript 实现的桌面模拟器。</p>
            <p>文件保存在当前浏览器的本地存储中。</p>
            <p>浏览器内嵌页面可能受目标网站的安全策略限制。</p>
          </div>`;
    }
  }

  function renderExplorer(win) {
    const folderId = win.dataset.folderId || fs.id;
    let current = findNode(folderId);

    if (!current || current.type !== "folder") {
      current = fs;
      win.dataset.folderId = fs.id;
    }

    const address = $("[data-explorer-address]", win);
    const area = $("[data-files-area]", win);
    if (!area) return;

    if (address) address.textContent = `📂 ${current.name}`;

    const search = ($("[data-explorer-search]", win)?.value || "").trim().toLowerCase();
    const items = (current.children || []).filter(item =>
      item.name.toLowerCase().includes(search)
    );

    area.innerHTML = `
      <h2 class="files-heading">${escapeHTML(current.name)}</h2>
      ${items.length
        ? `<div class="file-grid">${items.map(item => `
            <div class="file-item"
                 data-file-id="${escapeHTML(item.id)}"
                 title="${escapeHTML(item.name)}">
              <span class="icon">${getIcon(item)}</span>
              ${escapeHTML(item.name)}
            </div>
          `).join("")}</div>`
        : `<p class="empty">此文件夹为空。</p>`}
    `;
  }

  function navigateExplorer(win, location) {
    if (location === "trash") {
      openApp("trash");
      return;
    }

    if (location === "root") {
      win.dataset.folderId = fs.id;
      renderExplorer(win);
      return;
    }

    const names = {
      desktop: "桌面",
      documents: "文档",
      downloads: "下载",
      pictures: "图片"
    };

    const target = fs.children.find(item =>
      item.type === "folder" && item.name === names[location]
    );

    if (target) {
      win.dataset.folderId = target.id;
      renderExplorer(win);
    } else {
      notify("没有找到该文件夹");
    }
  }

  function explorerCommand(win, command) {
    const folderId = win.dataset.folderId || fs.id;
    const current = findNode(folderId);

    if (command === "up") {
      const parent = findParent(folderId);
      if (parent) {
        win.dataset.folderId = parent.id;
        renderExplorer(win);
      }
      return;
    }

    if (command === "refresh") {
      renderExplorer(win);
      return;
    }

    if (command === "new-folder" || command === "new-file") {
      const isFolder = command === "new-folder";
      const name = prompt(isFolder ? "文件夹名称：" : "文件名：", isFolder ? "新建文件夹" : "新建文件.txt");
      if (!name?.trim()) return;

      const created = createNode(current.id, isFolder ? "folder" : "file", name.trim());
      if (created) {
        save();
        renderAllFileViews();
        notify(isFolder ? "文件夹已创建" : "文件已创建");
      }
    }
  }

  function renderTrash(win) {
    const area = $("[data-trash-area]", win);
    if (!area) return;

    if (!trash.length) {
      area.innerHTML = `<p class="empty">回收站为空。</p>`;
      return;
    }

    area.innerHTML = `<div class="file-grid">${trash.map(entry => `
      <div class="file-item" data-trash-id="${escapeHTML(entry.node.id)}">
        <span class="icon">${getIcon(entry.node)}</span>
        ${escapeHTML(entry.node.name)}
      </div>
    `).join("")}</div>`;

    $$("[data-trash-id]", win).forEach(item => {
      item.addEventListener("click", () => {
        $$("[data-trash-id]", win).forEach(other => other.classList.remove("selected"));
        item.classList.add("selected");
        win.dataset.selectedTrash = item.dataset.trashId;
      });

      item.addEventListener("dblclick", () => restoreTrashItem(item.dataset.trashId));
    });
  }

  function restoreSelectedTrash(win) {
    const id = win.dataset.selectedTrash;
    if (!id) return notify("请先选择回收站项目");
    restoreTrashItem(id);
  }

  function restoreTrashItem(nodeId) {
    const index = trash.findIndex(entry => entry.node.id === nodeId);
    if (index < 0) return;

    const entry = trash[index];
    let parent = findNode(entry.parentId);
    if (!parent || parent.type !== "folder") parent = getDesktopFolder();

    if (parent.children.some(item => item.name.toLowerCase() === entry.node.name.toLowerCase())) {
      entry.node.name = `恢复的 ${entry.node.name}`;
    }

    parent.children.push(entry.node);
    trash.splice(index, 1);
    save();
    renderAllFileViews();
    notify("项目已还原");
  }

  function emptyTrash() {
    if (!trash.length) return notify("回收站已经是空的");
    if (!confirm("确定永久删除回收站中的所有项目吗？")) return;

    trash = [];
    save();
    renderAllFileViews();
    notify("回收站已清空");
  }

  function loadTextFile(win, fileId) {
    const node = findNode(fileId);
    if (!node || node.type !== "file") return;

    win.dataset.fileId = node.id;
    const textarea = $("[data-notepad]", win);
    const name = $("[data-note-name]", win);

    if (textarea) textarea.value = node.content || "";
    if (name) name.textContent = node.name;
  }

  function loadPhoto(win, fileId) {
    const node = findNode(fileId);
    if (!node || node.type !== "file") return;

    const image = $("[data-photo-image]", win);
    if (image) image.src = node.content || "";
  }

  function notepadCommand(win, command) {
    const textarea = $("[data-notepad]", win);
    const nameLabel = $("[data-note-name]", win);
    if (!textarea) return;

    if (command === "new") {
      win.dataset.fileId = "";
      textarea.value = "";
      if (nameLabel) nameLabel.textContent = "未命名.txt";
      textarea.focus();
      return;
    }

    if (command === "save") {
      let node = findNode(win.dataset.fileId);

      if (!node) {
        const name = prompt("保存文件名：", "新建文档.txt");
        if (!name?.trim()) return;

        node = createNode(getDesktopFolder().id, "file", name.trim(), textarea.value);
        if (!node) return;

        win.dataset.fileId = node.id;
      } else {
        node.content = textarea.value;
      }

      if (nameLabel) nameLabel.textContent = node.name;
      save();
      renderAllFileViews();
      notify("文件已保存到桌面");
    }
  }

  function calculatorKey(win, key) {
    const display = $("[data-calc-display]", win);
    if (!display) return;

    let expression = display.dataset.expression || "";

    if (key === "C") {
      display.dataset.expression = "";
      display.value = "0";
      return;
    }

    if (key === "⌫") {
      expression = expression.slice(0, -1);
      display.dataset.expression = expression;
      display.value = expression || "0";
      return;
    }

    if (key === "=") {
      try {
        const safeExpression = expression
          .replace(/×/g, "*")
          .replace(/÷/g, "/")
          .replace(/−/g, "-");

        if (!safeExpression || !/^[\d+\-*/().%\s]+$/.test(safeExpression)) {
          throw new Error("Invalid expression");
        }

        const result = Function(`"use strict"; return (${safeExpression});`)();
        if (!Number.isFinite(result)) throw new Error("Invalid result");

        display.value = String(Number(result.toFixed(10)));
        display.dataset.expression = display.value;
      } catch {
        display.value = "错误";
        display.dataset.expression = "";
      }
      return;
    }

    if (key === "±") {
      if (expression) expression = `-(${expression})`;
      else expression = "-";
    } else {
      expression += key;
    }

    display.dataset.expression = expression;
    display.value = expression || "0";
  }

  function initBrowser(win) {
    win._history = ["about:home"];
    win._historyIndex = 0;
    showBrowserHome(win);
  }

  function getBrowserHome() {
    const links = BOOKMARKS.map(bookmark => `
      <a href="${escapeHTML(bookmark.url)}" target="_self">
        ${escapeHTML(bookmark.icon)} ${escapeHTML(bookmark.name)}
      </a>
    `).join("");

    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}
body{
  font-family:"Segoe UI","Microsoft YaHei",sans-serif;
  margin:0;min-height:100vh;display:grid;place-items:center;
  background:linear-gradient(135deg,#1b3a75,#241b58 55%,#0a1226);
  color:#fff
}
.card{
  max-width:calc(100vw - 32px);text-align:center;padding:34px 42px;
  border-radius:16px;background:rgba(255,255,255,.08);
  backdrop-filter:blur(10px)
}
h1{margin:0 0 6px;font-size:26px}
p{margin:0 0 20px;color:#b9c6e4;font-size:13px}
a{
  display:inline-block;margin:5px;padding:9px 16px;border-radius:8px;
  background:rgba(255,255,255,.14);color:#fff;text-decoration:none;font-size:13px
}
a:hover{background:rgba(255,255,255,.26)}
</style>
</head>
<body>
<div class="card">
  <h1>🌐 Web 浏览器</h1>
  <p>在上方地址栏输入网址，或点击下面的快捷入口</p>
  ${links}
</div>
</body>
</html>`;
  }

  function showBrowserHome(win) {
    const frame = $("[data-browser-frame]", win);
    const address = $("[data-browser-address]", win);
    if (!frame) return;

    frame.removeAttribute("src");
    frame.srcdoc = getBrowserHome();
    if (address) address.value = "";
  }

  function normalizeURL(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw)
      ? raw
      : `https://${raw}`;

    try {
      const url = new URL(candidate);

      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.href;
      }

      return "";
    } catch {
      return `https://www.bing.com/search?q=${encodeURIComponent(raw)}`;
    }
  }

  function browserNavigate(win, value) {
    const url = normalizeURL(value);
    if (!url) return notify("请输入有效的网址");

    win._history = (win._history || ["about:home"]).slice(0, win._historyIndex + 1);
    win._history.push(url);
    win._historyIndex = win._history.length - 1;
    loadBrowserURL(win, url);
  }

  function loadBrowserURL(win, url) {
    const frame = $("[data-browser-frame]", win);
    const address = $("[data-browser-address]", win);
    if (!frame) return;

    if (url === "about:home") {
      showBrowserHome(win);
      return;
    }

    frame.removeAttribute("srcdoc");
    frame.src = url;
    if (address) address.value = url;
  }

  function browserCommand(win, command) {
    const address = $("[data-browser-address]", win);

    switch (command) {
      case "go":
        browserNavigate(win, address?.value);
        break;

      case "home":
        win._history = (win._history || []).slice(0, win._historyIndex + 1);
        win._history.push("about:home");
        win._historyIndex = win._history.length - 1;
        showBrowserHome(win);
        break;

      case "reload": {
        const current = win._history?.[win._historyIndex] || "about:home";
        loadBrowserURL(win, current);
        break;
      }

      case "back":
        if (win._historyIndex > 0) {
          win._historyIndex--;
          loadBrowserURL(win, win._history[win._historyIndex]);
        }
        break;

      case "forward":
        if (win._historyIndex < win._history.length - 1) {
          win._historyIndex++;
          loadBrowserURL(win, win._history[win._historyIndex]);
        }
        break;

      case "newtab": {
        const current = win._history?.[win._historyIndex];
        if (!current || current === "about:home") return notify("请先打开一个网页");
        window.open(current, "_blank", "noopener,noreferrer");
        break;
      }

      default:
        break;
    }
  }

  function initPaint(win) {
    const canvas = $("[data-paint-canvas]", win);
    if (!canvas || canvas.dataset.initialized) return;
    canvas.dataset.initialized = "true";

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    let drawing = false;
    let lastX = 0;
    let lastY = 0;

    function point(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * canvas.width / rect.width,
        y: (event.clientY - rect.top) * canvas.height / rect.height
      };
    }

    canvas.addEventListener("pointerdown", event => {
      drawing = true;
      const p = point(event);
      lastX = p.x;
      lastY = p.y;
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", event => {
      if (!drawing) return;

      const p = point(event);
      const color = $("[data-paint-color]", win)?.value || "#1a73e8";
      const size = Number($("[data-paint-size]", win)?.value || 5);
      const eraser = Boolean($("[data-paint-eraser]", win)?.checked);

      ctx.strokeStyle = eraser ? "#fff" : color;
      ctx.lineWidth = eraser ? size * 3 : size;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      lastX = p.x;
      lastY = p.y;
    });

    canvas.addEventListener("pointerup", () => drawing = false);
    canvas.addEventListener("pointercancel", () => drawing = false);
  }

  function paintCommand(win, command) {
    const canvas = $("[data-paint-canvas]", win);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    if (command === "clear") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return notify("画布已清空");
    }

    if (command === "save") {
      const inputName = prompt("图片名称：", "我的画作.png");
      if (!inputName?.trim()) return;

      const name = /\.png$/i.test(inputName.trim())
        ? inputName.trim()
        : `${inputName.trim()}.png`;

      const created = createNode(getDesktopFolder().id, "file", name, canvas.toDataURL("image/png"));
      if (!created) return;

      save();
      renderAllFileViews();
      notify("画作已保存到桌面");
    }
  }

  function initMinesweeper(win) {
    const rows = 9;
    const columns = 9;
    const mineCount = 10;
    const cells = Array.from({ length: rows * columns }, () => ({
      mine: false,
      open: false,
      flag: false,
      count: 0
    }));

    let placed = 0;
    while (placed < mineCount) {
      const index = Math.floor(Math.random() * cells.length);
      if (!cells[index].mine) {
        cells[index].mine = true;
        placed++;
      }
    }

    function neighbors(index) {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const result = [];

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = row + dr;
          const nc = col + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < columns) {
            result.push(nr * columns + nc);
          }
        }
      }

      return result;
    }

    cells.forEach((cell, index) => {
      cell.count = neighbors(index).filter(i => cells[i].mine).length;
    });

    win._mine = { cells, neighbors, mineCount, ended: false, startedAt: Date.now() };
    renderMinesweeper(win);
  }

  function renderMinesweeper(win) {
    const grid = $("[data-mine-grid]", win);
    const game = win._mine;
    if (!grid || !game) return;

    grid.innerHTML = game.cells.map((cell, index) => {
      let className = "mine-cell";
      let label = "";

      if (cell.open) {
        className += " open";
        if (cell.mine) {
          className += " boom";
          label = "💥";
        } else if (cell.count > 0) {
          className += ` mine-n${cell.count}`;
          label = String(cell.count);
        }
      } else if (cell.flag) {
        label = "🚩";
      }

      return `<button class="${className}" data-mine-cell="${index}" type="button">${label}</button>`;
    }).join("");

    const flags = game.cells.filter(cell => cell.flag).length;
    $("[data-mine-count]", win).textContent = `💣 ${game.mineCount - flags}`;
    $("[data-mine-time]", win).textContent =
      `⏱ ${Math.floor((Date.now() - game.startedAt) / 1000)} 秒`;
  }

  function openMineCell(win, index) {
    const game = win._mine;
    const cell = game?.cells[index];
    if (!game || game.ended || !cell || cell.open || cell.flag) return;

    cell.open = true;

    if (cell.mine) {
      game.ended = true;
      game.cells.forEach(item => {
        if (item.mine) item.open = true;
      });
      renderMinesweeper(win);
      return notify("踩到地雷了！点击重新开始再试一次");
    }

    if (cell.count === 0) {
      const stack = [index];

      while (stack.length) {
        const current = stack.pop();

        game.neighbors(current).forEach(neighborIndex => {
          const neighbor = game.cells[neighborIndex];
          if (neighbor.open || neighbor.flag || neighbor.mine) return;

          neighbor.open = true;
          if (neighbor.count === 0) stack.push(neighborIndex);
        });
      }
    }

    const safeCells = game.cells.length - game.mineCount;
    const openedSafeCells = game.cells.filter(item => item.open && !item.mine).length;

    renderMinesweeper(win);

    if (openedSafeCells === safeCells) {
      game.ended = true;
      game.cells.forEach(item => {
        if (item.mine) item.flag = true;
      });
      renderMinesweeper(win);
      notify("恭喜，扫雷通关！");
    }
  }

  function toggleMineFlag(win, index) {
    const game = win._mine;
    const cell = game?.cells[index];
    if (!game || game.ended || !cell || cell.open) return;

    cell.flag = !cell.flag;
    renderMinesweeper(win);
  }

  function initCalendar(win) {
    win._monthOffset = 0;
    renderCalendar(win);
  }

  function renderCalendar(win) {
    const title = $("[data-calendar-title]", win);
    const grid = $("[data-calendar-grid]", win);
    if (!title || !grid) return;

    const now = new Date();
    const view = new Date(now.getFullYear(), now.getMonth() + win._monthOffset, 1);
    const year = view.getFullYear();
    const month = view.getMonth();
    const firstWeekday = view.getDay();
    const daysThisMonth = new Date(year, month + 1, 0).getDate();
    const daysLastMonth = new Date(year, month, 0).getDate();
    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];

    title.textContent = `${year} 年 ${month + 1} 月`;

    let html = weekdays.map(day => `<div class="cal-wd">${day}</div>`).join("");

    for (let i = firstWeekday - 1; i >= 0; i--) {
      html += `<div class="cal-day dim">${daysLastMonth - i}</div>`;
    }

    for (let day = 1; day <= daysThisMonth; day++) {
      const isToday =
        win._monthOffset === 0 &&
        day === now.getDate();

      html += `<div class="cal-day${isToday ? " today" : ""}">${day}</div>`;
    }

    const used = firstWeekday + daysThisMonth;
    const trailing = (7 - (used % 7)) % 7;

    for (let day = 1; day <= trailing; day++) {
      html += `<div class="cal-day dim">${day}</div>`;
    }

    grid.innerHTML = html;
  }

  function initTaskManager(win) {
    renderTaskManager(win);
    win._taskTimer = window.setInterval(() => {
      if (win.isConnected && !win.classList.contains("minimized")) {
        renderTaskManager(win, true);
      }
    }, 3000);
  }

  function renderTaskManager(win, preserveSelection = false) {
    const body = $("[data-task-body]", win);
    if (!body) return;

    const selected = preserveSelection ? win.dataset.selectedTask : "";
    const rows = [...windows.keys()].map(name => ({
      name,
      cpu: (Math.random() * 5).toFixed(1),
      memory: Math.floor(30 + Math.random() * 100)
    }));

    body.innerHTML = rows.map(row => `
      <tr data-task-app="${escapeHTML(row.name)}" class="${row.name === selected ? "selected" : ""}">
        <td>${escapeHTML(APPS[row.name].icon)} ${escapeHTML(APPS[row.name].title)}</td>
        <td>${row.cpu}%</td>
        <td>${row.memory} MB</td>
        <td>正在运行</td>
      </tr>
    `).join("") || `<tr><td colspan="4" class="empty">没有运行中的应用。</td></tr>`;
  }

  function endTask(win) {
    const appName = win.dataset.selectedTask;
    if (!appName) return notify("请先选择一个任务");
    if (appName === "taskmgr") return notify("不能结束任务管理器自身");

    const target = windows.get(appName);
    if (!target) return notify("该应用已经关闭");

    if (target._taskTimer) clearInterval(target._taskTimer);
    if (target._mediaStop) target._mediaStop();

    target.remove();
    windows.delete(appName);
    delete win.dataset.selectedTask;

    renderTaskManager(win);
    renderTaskbar();
    notify(`已结束任务：${APPS[appName].title}`);
  }

  const MEDIA_TRACKS = [
    { name: "小星星", notes: [[262, .35], [262, .35], [392, .35], [392, .35], [440, .35], [440, .35], [392, .7]] },
    { name: "欢乐颂", notes: [[330, .35], [330, .35], [349, .35], [392, .35], [392, .35], [349, .35], [330, .35], [294, .35]] },
    { name: "简单旋律", notes: [[330, .3], [392, .3], [440, .5], [392, .3], [330, .3], [262, .6]] }
  ];

  function initMedia(win) {
    win._mediaStop = null;
  }

  function playTrack(win, index) {
    win._mediaStop?.();

    const track = MEDIA_TRACKS[index];
    if (!track) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return notify("当前浏览器不支持音频播放");

    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.value = 0.12;
    gain.connect(context.destination);

    const nowBox = $("[data-media-now]", win);
    const title = $("[data-media-title]", win);

    if (nowBox) nowBox.classList.add("playing");
    if (title) title.textContent = `正在播放：${track.name}`;

    let startTime = context.currentTime + 0.05;

    track.notes.forEach(([frequency, duration]) => {
      const oscillator = context.createOscillator();
      const noteGain = context.createGain();

      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;

      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.exponentialRampToValueAtTime(1, startTime + 0.025);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.9);

      oscillator.connect(noteGain);
      noteGain.connect(gain);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);

      startTime += duration;
    });

    const timer = window.setTimeout(stop, Math.max(100, (startTime - context.currentTime) * 1000 + 200));

    function stop() {
      clearTimeout(timer);
      try { context.close(); } catch {}
      win._mediaStop = null;
      if (nowBox) nowBox.classList.remove("playing");
      if (title) title.textContent = "未在播放";
    }

    win._mediaStop = stop;
  }

  function toggleTheme() {
    settings.dark = !settings.dark;
    save();
    applySettings();

    const win = windows.get("settings");
    if (win) renderWindowContent(win);

    notify(settings.dark ? "已切换到深色模式" : "已切换到浅色模式");
  }

  function setWallpaper(name) {
    settings.wallpaper = ["blue", "purple", "green"].includes(name) ? name : "blue";
    save();
    applySettings();
    notify("桌面壁纸已更换");
  }

  function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit"
    });
    const date = now.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    if ($("#clockTime")) $("#clockTime").textContent = time;
    if ($("#clockDate")) $("#clockDate").textContent = date;
  }

  /* 终端路径参数支持双引号或单引号，例如 cat "文档/欢迎使用.txt" */
  function parseArgs(text) {
    const args = [];
    const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      args.push(match[1] ?? match[2] ?? match[3]);
    }

    return args;
  }

  function resolvePath(path) {
    if (!path || path === "." || path === "/" || path === "\\") return fs;

    const parts = String(path).replace(/\\/g, "/").split("/").filter(Boolean);
    let current = fs;

    if (parts[0]?.toLowerCase() === fs.name.toLowerCase()) {
      parts.shift();
    }

    for (const part of parts) {
      if (part === ".") continue;

      if (part === "..") {
        current = current.id === fs.id ? fs : (findParent(current.id) || fs);
        continue;
      }

      if (current.type !== "folder") return null;
      current = current.children.find(child =>
        child.name.toLowerCase() === part.toLowerCase()
      );

      if (!current) return null;
    }

    return current;
  }

  function resolveParentAndName(path) {
    const parts = String(path || "").replace(/\\/g, "/").split("/").filter(Boolean);
    if (!parts.length) return null;

    const name = parts.pop();

    if (parts[0]?.toLowerCase() === fs.name.toLowerCase()) {
      parts.shift();
    }

    const parent = parts.length ? resolvePath(parts.join("/")) : fs;
    if (!parent || parent.type !== "folder") return null;

    return { parent, name };
  }

  function terminalPrint(win, text) {
    const output = $("[data-terminal-output]", win);
    if (!output) return;

    output.textContent += `${text}\n`;
    output.scrollTop = output.scrollHeight;
  }

  function terminalRun(win, commandText) {
    const input = $("[data-terminal-input]", win);
    const raw = commandText.trim();

    if (!raw) return;

    terminalPrint(win, `C:\\Users\\用户> ${raw}`);
    if (input) input.value = "";

    const splitAt = raw.search(/\s/);
    const command = (splitAt < 0 ? raw : raw.slice(0, splitAt)).toLowerCase();
    const rest = splitAt < 0 ? "" : raw.slice(splitAt).trim();
    const args = parseArgs(rest);
    const first = args[0];

    let result = "";

    switch (command) {
      case "help":
        result = [
          "可用命令：",
          "help, ver, date, time, whoami, pwd, dir, ls, echo, apps, open,",
          "mkdir, touch, cat, rename, del, copy, move, theme, tree, cls",
          "",
          '示例：mkdir "项目资料"',
          '示例：touch "项目资料/备注.txt"',
          '示例：cat "文档/说明.txt"',
          "示例：open browser",
          "示例：theme dark"
        ].join("\n");
        break;

      case "ver":
        result = "Windows Web Terminal v1.0";
        break;

      case "date":
        result = new Date().toLocaleDateString("zh-CN", {
          year: "numeric", month: "long", day: "numeric", weekday: "long"
        });
        break;

      case "time":
        result = new Date().toLocaleTimeString("zh-CN");
        break;

      case "whoami":
        result = "windows-web\\用户";
        break;

      case "pwd":
        result = "此电脑";
        break;

      case "dir":
      case "ls": {
        const target = first ? resolvePath(first) : fs;

        if (!target) {
          result = "找不到该路径。";
          break;
        }

        if (target.type !== "folder") {
          result = "该路径不是文件夹。";
          break;
        }

        result = target.children.length
          ? target.children.map(item => `${item.type === "folder" ? "[文件夹]" : "[文件]"} ${item.name}`).join("\n")
          : "空目录";
        break;
      }

      case "echo":
        result = rest;
        break;

      case "apps":
        result = Object.entries(APPS)
          .map(([name, app]) => `${name} - ${app.title}`)
          .join("\n");
        break;

      case "open": {
        const appName = first?.toLowerCase();

        if (!appName || !APPS[appName]) {
          result = "用法：open <应用英文名>。输入 apps 查看应用列表。";
        } else {
          openApp(appName);
          result = `已打开：${APPS[appName].title}`;
        }
        break;
      }

      case "mkdir": {
        if (!first) {
          result = "用法：mkdir <文件夹路径>";
          break;
        }

        const target = resolveParentAndName(first);
        if (!target) {
          result = "路径无效，或父文件夹不存在。";
          break;
        }

        const created = createNode(target.parent.id, "folder", target.name);
        if (created) {
          save();
          renderAllFileViews();
          result = `已创建文件夹：${first}`;
        } else {
          result = "创建失败，可能存在同名项目。";
        }
        break;
      }

      case "touch": {
        if (!first) {
          result = "用法：touch <文件路径>";
          break;
        }

        if (resolvePath(first)) {
          result = "该路径已经存在。";
          break;
        }

        const target = resolveParentAndName(first);
        if (!target) {
          result = "路径无效，或父文件夹不存在。";
          break;
        }

        const created = createNode(target.parent.id, "file", target.name);
        if (created) {
          save();
          renderAllFileViews();
          result = `已创建文件：${first}`;
        } else {
          result = "创建失败，可能存在同名项目。";
        }
        break;
      }

      case "cat": {
        const target = first ? resolvePath(first) : null;

        if (!target) result = "找不到该文件。";
        else if (target.type !== "file") result = "该路径是文件夹。";
        else result = target.content || "（文件内容为空）";
        break;
      }

      case "rename": {
        if (args.length < 2) {
          result = '用法：rename <原路径> <新名称>';
          break;
        }

        const target = resolvePath(args[0]);
        const parent = target && findParent(target.id);
        const newName = args[1].trim();

        if (!target || !parent) {
          result = "找不到该项目，或不能重命名根目录。";
          break;
        }

        if (parent.children.some(item =>
          item.id !== target.id && item.name.toLowerCase() === newName.toLowerCase()
        )) {
          result = "目标目录中已有同名项目。";
          break;
        }

        target.name = newName;
        save();
        renderAllFileViews();
        result = `已重命名为：${newName}`;
        break;
      }

      case "del":
      case "rm": {
        const target = first ? resolvePath(first) : null;

        if (!target || target.id === fs.id) {
          result = "找不到项目，或不能删除根目录。";
          break;
        }

        if (deleteNodeToTrash(target.id)) {
          renderAllFileViews();
          result = `已移到回收站：${target.name}`;
        } else {
          result = "删除失败。";
        }
        break;
      }

      case "copy":
      case "move": {
        if (args.length < 2) {
          result = `用法：${command} <源路径> <目标文件夹路径>`;
          break;
        }

        const source = resolvePath(args[0]);
        const destination = resolvePath(args[1]);

        if (!source || !destination || destination.type !== "folder") {
          result = "源路径或目标文件夹无效。";
          break;
        }

        if (source.id === fs.id ||
            (source.type === "folder" && containsNode(source, destination.id))) {
          result = "不能将根目录移动，或把文件夹放进自身内部。";
          break;
        }

        if (destination.children.some(item =>
          item.name.toLowerCase() === source.name.toLowerCase()
        )) {
          result = "目标文件夹中已有同名项目。";
          break;
        }

        if (command === "copy") {
          destination.children.push(cloneNode(source));
        } else {
          const parent = findParent(source.id);
          if (!parent) {
            result = "不能移动根目录。";
            break;
          }

          parent.children = parent.children.filter(item => item.id !== source.id);
          destination.children.push(source);
        }

        save();
        renderAllFileViews();
        result = command === "copy" ? "复制完成。" : "移动完成。";
        break;
      }

      case "theme": {
        const mode = (first || "toggle").toLowerCase();

        if (mode === "dark") settings.dark = true;
        else if (mode === "light") settings.dark = false;
        else if (mode === "toggle") settings.dark = !settings.dark;
        else {
          result = "用法：theme [dark|light|toggle]";
          break;
        }

        save();
        applySettings();
        result = `主题已切换为${settings.dark ? "深色" : "浅色"}模式。`;
        break;
      }

      case "tree": {
        const lines = [];

        function walk(node, prefix) {
          for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const last = i === node.children.length - 1;
            lines.push(`${prefix}${last ? "└─ " : "├─ "}${child.name}`);

            if (child.type === "folder") {
              walk(child, prefix + (last ? "   " : "│  "));
            }
          }
        }

        walk(fs, "");
        result = lines.join("\n") || "空目录";
        break;
      }

      case "cls":
      case "clear":
        $("[data-terminal-output]", win).textContent = "";
        return;

      default:
        result = `命令不存在：${raw}\n输入 help 查看命令列表。`;
    }

    if (result) terminalPrint(win, result);
  }

  function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit"
    });
    const date = now.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    if ($("#clockTime")) $("#clockTime").textContent = time;
    if ($("#clockDate")) $("#clockDate").textContent = date;
  }
})();
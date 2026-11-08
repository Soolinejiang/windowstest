const state = {
  windows: new Map(),
  zIndex: 100,
  notifications: [],
  toastTimer: null,
  dragState: null,
  clipboard: {
    mode: "none", // none | copy | cut
    nodeId: null
  },
  darkMode: false
};

document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  renderDesktop();
  renderAppGrid();
  renderTaskbar();
  bindGlobalEvents();
  updateClock();
  setInterval(updateClock, 1000);
  openApp("explorer");
});

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function applyTheme() {
  document.body.classList.toggle("dark", state.darkMode);
}

function notify(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}

function addNotification(message) {
  state.notifications.unshift(String(message));

  const card = document.getElementById("notificationCard");
  if (!card) return;

  card.textContent = "";
  state.notifications.slice(0, 6).forEach(item => {
    const row = document.createElement("div");
    row.textContent = item;
    card.appendChild(row);
  });
}

function clearNotifications() {
  state.notifications = [];
  const card = document.getElementById("notificationCard");
  if (card) card.textContent = "暂无通知";
}

function renderDesktop() {
  const desktop = document.getElementById("desktop");
  if (!desktop) return;

  desktop.innerHTML = "";

  // 桌面文件和文件夹
  (fs.children || []).forEach(item => {
    const node = document.createElement("div");
    node.className = "desktop-icon";
    node.dataset.nodeId = item.id;

    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = item.type === "folder" ? "📁" : "📄";

    const name = document.createElement("div");
    name.textContent = item.name;

    node.append(icon, name);

    node.addEventListener("dblclick", () => {
      if (item.type === "folder") {
        openApp("explorer", { nodeId: item.id });
      } else {
        openApp("notepad", { fileId: item.id });
      }
    });

    desktop.appendChild(node);
  });

  // 桌面应用快捷方式
  Object.entries(APPS).forEach(([appName, app]) => {
    const shortcut = document.createElement("div");
    shortcut.className = "desktop-icon";
    shortcut.dataset.appLaunch = appName;
    shortcut.title = `双击打开${app.title}`;

    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = app.icon;

    const name = document.createElement("div");
    name.textContent = app.title;

    shortcut.append(icon, name);
    shortcut.addEventListener("dblclick", () => openApp(appName));

    desktop.appendChild(shortcut);
  });
}

function renderAppGrid() {
  const container = document.getElementById("appGrid");
  if (!container) return;

  container.innerHTML = Object.entries(APPS)
    .map(([key, app]) => `
      <button class="app-card" data-launch="${escapeHTML(key)}" type="button">
        <span class="icon">${escapeHTML(app.icon)}</span>
        <span class="name">${escapeHTML(app.title)}</span>
      </button>
    `)
    .join("");
}

function renderTaskbar() {
  const container = document.getElementById("taskButtons");
  if (!container) return;

  const apps = [...state.windows.keys()];
  const focusedWindow = document.querySelector(".window.focused");
  const focusedApp = focusedWindow?.dataset.app;

  container.innerHTML = apps
    .map(appName => {
      const app = APPS[appName];
      if (!app) return "";

      return `
        <button class="task-btn ${appName === focusedApp ? "active" : ""}"
                data-task-app="${escapeHTML(appName)}"
                type="button">
          <span>${escapeHTML(app.icon)}</span>
          <span class="title">${escapeHTML(app.title)}</span>
        </button>
      `;
    })
    .join("");
}

function bindGlobalEvents() {
  document.getElementById("clearNotifications")
    ?.addEventListener("click", clearNotifications);

  document.getElementById("startButton")?.addEventListener("click", event => {
    event.stopPropagation();

    const menu = document.getElementById("startMenu");
    const notifications = document.getElementById("notifications");
    if (!menu) return;

    const shouldShow = !menu.classList.contains("show");
    menu.classList.toggle("show", shouldShow);

    if (shouldShow) notifications?.classList.remove("show");
  });

  document.getElementById("allAppsBtn")?.addEventListener("click", () => {
    document.getElementById("startMenu")?.classList.add("show");
  });

  document.getElementById("quickButton")?.addEventListener("click", event => {
    event.stopPropagation();

    const notifications = document.getElementById("notifications");
    const menu = document.getElementById("startMenu");
    if (!notifications) return;

    const shouldShow = !notifications.classList.contains("show");
    notifications.classList.toggle("show", shouldShow);

    if (shouldShow) menu?.classList.remove("show");
  });

  const filterApps = event => {
    const query = event.target.value.trim().toLowerCase();

    document.querySelectorAll(".app-card").forEach(card => {
      card.style.display = card.textContent.toLowerCase().includes(query)
        ? "flex"
        : "none";
    });
  };

  document.getElementById("taskSearchInput")?.addEventListener("input", filterApps);
  document.getElementById("startSearch")?.addEventListener("input", filterApps);

  document.addEventListener("click", event => {
    const contextAction = event.target.closest("[data-context-action]");
    if (contextAction) {
      handleContextAction(
        contextAction.dataset.contextAction,
        contextAction.dataset.nodeId
      );
      return;
    }

    const launchButton = event.target.closest("[data-launch]");
    if (launchButton) {
      openApp(launchButton.dataset.launch);
      document.getElementById("startMenu")?.classList.remove("show");
      return;
    }

    const desktopShortcut = event.target.closest("[data-app-launch]");
    if (desktopShortcut) {
      // 桌面快捷方式用双击启动，单击只选中图标。
      document.querySelectorAll(".desktop-icon.selected")
        .forEach(item => item.classList.remove("selected"));
      desktopShortcut.classList.add("selected");
    }

    const taskButton = event.target.closest("[data-task-app]");
    if (taskButton) {
      const win = state.windows.get(taskButton.dataset.taskApp);
      if (win) {
        win.classList.remove("minimized");
        win.classList.add("show");
        focusWindow(win);
      }
      return;
    }

    const win = event.target.closest(".window");
    if (win) focusWindow(win);

    if (!event.target.closest(".context-menu")) {
      document.getElementById("contextMenu")?.classList.remove("show");
    }

    if (!event.target.closest("#startButton") &&
        !event.target.closest("#startMenu")) {
      document.getElementById("startMenu")?.classList.remove("show");
    }

    if (!event.target.closest("#quickButton") &&
        !event.target.closest("#notifications")) {
      document.getElementById("notifications")?.classList.remove("show");
    }
  });

  document.addEventListener("contextmenu", event => {
    const nodeElement = event.target.closest("[data-node-id]");
    if (nodeElement) {
      event.preventDefault();
      showNodeContextMenu(
        nodeElement.dataset.nodeId,
        event.clientX,
        event.clientY
      );
      return;
    }

    if (event.target.closest("#desktop")) {
      event.preventDefault();
      showDesktopContextMenu(event.clientX, event.clientY);
    }
  });

  document.addEventListener("pointerdown", event => {
    const titlebar = event.target.closest(".titlebar");
    const win = event.target.closest(".window");

    if (!titlebar || !win || event.target.closest("button")) return;
    if (win.classList.contains("maximized")) return;

    state.dragState = {
      win,
      offsetX: event.clientX - win.offsetLeft,
      offsetY: event.clientY - win.offsetTop
    };

    focusWindow(win);
  });

  document.addEventListener("pointermove", event => {
    if (!state.dragState) return;

    const { win, offsetX, offsetY } = state.dragState;
    win.style.left = `${event.clientX - offsetX}px`;
    win.style.top = `${Math.max(0, event.clientY - offsetY)}px`;
  });

  document.addEventListener("pointerup", () => {
    state.dragState = null;
  });

  document.addEventListener("pointercancel", () => {
    state.dragState = null;
  });
}

function showContextMenu(html, x, y) {
  const menu = document.getElementById("contextMenu");
  if (!menu) return;

  menu.innerHTML = html;
  menu.classList.add("show");

  // 防止右键菜单超出浏览器窗口。
  const width = menu.offsetWidth || 190;
  const height = menu.offsetHeight || 180;
  menu.style.left = `${Math.min(x, window.innerWidth - width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - height - 8)}px`;
}

function showDesktopContextMenu(x, y) {
  const canPaste =
    state.clipboard.mode !== "none" && Boolean(state.clipboard.nodeId);

  showContextMenu(`
    <button type="button" data-context-action="new-folder">新建文件夹</button>
    <button type="button" data-context-action="new-file">新建文件</button>
    ${canPaste
      ? `<button type="button" data-context-action="paste" data-node-id="${escapeHTML(fs.id)}">粘贴</button>`
      : ""}
    <div class="separator"></div>
    <button type="button" data-context-action="refresh">刷新</button>
  `, x, y);
}

function showNodeContextMenu(nodeId, x, y) {
  const node = findNode(nodeId);
  if (!node) return;

  const canPaste =
    state.clipboard.mode !== "none" && Boolean(state.clipboard.nodeId);

  showContextMenu(`
    <button type="button" data-context-action="open-node"
            data-node-id="${escapeHTML(nodeId)}">
      ${node.type === "folder" ? "打开" : "打开文件"}
    </button>
    <button type="button" data-context-action="rename"
            data-node-id="${escapeHTML(nodeId)}">重命名</button>
    <button type="button" data-context-action="copy"
            data-node-id="${escapeHTML(nodeId)}">复制</button>
    <button type="button" data-context-action="cut"
            data-node-id="${escapeHTML(nodeId)}">剪切</button>
    <button type="button" data-context-action="delete"
            data-node-id="${escapeHTML(nodeId)}">删除</button>
    ${node.type === "folder" && canPaste
      ? `<button type="button" data-context-action="paste" data-node-id="${escapeHTML(nodeId)}">粘贴到这里</button>`
      : ""}
    <div class="separator"></div>
    <button type="button" data-context-action="refresh">刷新桌面</button>
  `, x, y);
}

function handleContextAction(action, nodeId) {
  document.getElementById("contextMenu")?.classList.remove("show");

  switch (action) {
    case "refresh":
      renderDesktop();
      notify("已刷新桌面");
      break;

    case "new-folder":
    case "new-file": {
      const isFolder = action === "new-folder";
      const defaultName = isFolder ? "新建文件夹" : "新建文件.txt";
      const name = prompt(
        isFolder ? "请输入文件夹名称" : "请输入文件名",
        defaultName
      );

      if (!name?.trim()) return;

      const created = createNode(
        fs.id,
        isFolder ? "folder" : "file",
        name.trim()
      );

      if (created) {
        renderDesktop();
        notify(isFolder ? "已创建文件夹" : "已创建文件");
      }
      break;
    }

    case "open-node": {
      const node = findNode(nodeId);
      if (!node) return;

      if (node.type === "folder") {
        openApp("explorer", { nodeId: node.id });
      } else {
        openApp("notepad", { fileId: node.id });
      }
      break;
    }

    case "rename": {
      const node = findNode(nodeId);
      if (!node) return;

      const name = prompt("请输入新名称", node.name);
      if (!name?.trim()) return;

      if (renameNode(nodeId, name.trim())) {
        renderDesktop();
        refreshExplorerWindows();
        notify("已重命名");
      }
      break;
    }

    case "copy":
    case "cut": {
      if (!findNode(nodeId)) return;

      state.clipboard = {
        mode: action,
        nodeId
      };

      notify(action === "copy" ? "已复制" : "已剪切");
      break;
    }

    case "paste": {
      const targetId = nodeId || fs.id;
      const target = findNode(targetId);
      const source = findNode(state.clipboard.nodeId);

      if (!target || target.type !== "folder" || !source) {
        notify("无法粘贴到此位置");
        return;
      }

      if (state.clipboard.mode === "copy") {
        if (pasteNodeIntoFolder(state.clipboard.nodeId, targetId)) {
          renderDesktop();
          refreshExplorerWindows();
          notify("已粘贴");
        }
      } else if (state.clipboard.mode === "cut") {
        if (moveNode(state.clipboard.nodeId, targetId)) {
          renderDesktop();
          refreshExplorerWindows();
          notify("已移动");
        } else {
          notify("无法移动到该文件夹");
        }
      }

      state.clipboard = { mode: "none", nodeId: null };
      break;
    }

    case "delete": {
      if (!nodeId || !confirm("确定删除该项吗？")) return;

      if (deleteNode(nodeId)) {
        renderDesktop();
        refreshExplorerWindows();
        notify("已删除");
      }
      break;
    }

    default:
      break;
  }
}

function refreshExplorerWindows() {
  const explorer = state.windows.get("explorer");
  if (!explorer) return;

  const currentId = explorer.dataset.currentFolder || fs.id;
  const content = explorer.querySelector(".window-content");
  if (!content) return;

  content.innerHTML = renderExplorer(currentId);
  bindAppContentEvents("explorer", explorer);
}

function focusWindow(win) {
  document.querySelectorAll(".window").forEach(element => {
    element.classList.remove("focused");
  });

  win.classList.add("focused");
  win.style.zIndex = String(++state.zIndex);
  renderTaskbar();
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

  const timeElement = document.getElementById("clockTime");
  const dateElement = document.getElementById("clockDate");

  if (timeElement) timeElement.textContent = time;
  if (dateElement) dateElement.textContent = date;
}

function openApp(appName, options = {}) {
  if (!APPS[appName]) return;

  let win = state.windows.get(appName);

  if (!win) {
    win = createWindow(appName);
    state.windows.set(appName, win);
  }

  if (appName === "explorer") {
    win.dataset.currentFolder = options.nodeId || fs.id;
  }

  const content = win.querySelector(".window-content");
  if (content) {
    content.innerHTML = renderAppContent(appName, options);
    bindAppContentEvents(appName, win);
  }

  win.classList.remove("minimized");
  win.classList.add("show");
  focusWindow(win);
  renderTaskbar();
}

function createWindow(appName) {
  const win = document.createElement("section");
  win.className = "window show";
  win.dataset.app = appName;

  const app = APPS[appName];
  const total = state.windows.size;

  win.style.left = `${Math.max(20, 120 + total * 36)}px`;
  win.style.top = `${Math.max(20, 70 + total * 22)}px`;

  win.innerHTML = `
    <header class="titlebar">
      <div class="window-title">
        <span>${escapeHTML(app.icon)}</span>
        <span>${escapeHTML(app.title)}</span>
      </div>
      <div class="window-controls">
        <button type="button" data-window-control="minimize" title="最小化">—</button>
        <button type="button" data-window-control="maximize" title="最大化">□</button>
        <button type="button" class="close" data-window-control="close" title="关闭">✕</button>
      </div>
    </header>
    <div class="window-content"></div>
  `;

  win.querySelectorAll("[data-window-control]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();

      const action = button.dataset.windowControl;

      if (action === "close") {
        win.remove();
        state.windows.delete(appName);
        renderTaskbar();
      } else if (action === "minimize") {
        win.classList.add("minimized");
        win.classList.remove("focused");
        renderTaskbar();
      } else if (action === "maximize") {
        win.classList.toggle("maximized");
      }
    });
  });

  document.body.appendChild(win);
  return win;
}

function renderAppContent(appName, options = {}) {
  switch (appName) {
    case "explorer":
      return renderExplorer(options.nodeId || fs.id);
    case "browser":
      return getBrowserContent();
    case "notepad":
      return renderNotepad(options.fileId);
    case "calculator":
      return renderCalculator();
    case "paint":
      return renderPaint();
    case "terminal":
      return renderTerminal();
    case "minesweeper":
      return renderMinesweeper();
    case "taskmgr":
      return renderTaskManager();
    case "calendar":
      return renderCalendar();
    case "media":
      return renderMedia();
    case "settings":
      return renderSettings();
    case "trash":
      return renderTrash();
    case "about":
      return renderAbout();
    default:
      return `<div style="padding:30px;">${escapeHTML(APPS[appName]?.title || "应用")}尚未实现</div>`;
  }
}

/* 浏览器主页：通过 iframe.srcdoc 显示 */
function getBrowserHome() {
  const links = BOOKMARKS.map(bookmark =>
    `<a href="${escapeHTML(bookmark.url)}">${escapeHTML(bookmark.icon)} ${escapeHTML(bookmark.name)}</a>`
  ).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *{box-sizing:border-box}
    body{
      font-family:"Segoe UI","Microsoft YaHei",sans-serif;
      margin:0;
      min-height:100vh;
      display:grid;
      place-items:center;
      background:linear-gradient(135deg,#1b3a75,#241b58 55%,#0a1226);
      color:#fff
    }
    .card{
      max-width:calc(100vw - 32px);
      text-align:center;
      padding:34px 42px;
      border-radius:16px;
      background:rgba(255,255,255,.08);
      backdrop-filter:blur(10px)
    }
    h1{margin:0 0 6px;font-size:26px}
    p{margin:0 0 20px;color:#b9c6e4;font-size:13px}
    a{
      display:inline-block;
      margin:5px;
      padding:9px 16px;
      border-radius:8px;
      background:rgba(255,255,255,.14);
      color:#fff;
      text-decoration:none;
      font-size:13px
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

function getBrowserContent() {
  const cards = BOOKMARKS.map(bookmark => `
    <button class="bm-card"
            type="button"
            data-browse-url="${escapeHTML(bookmark.url)}">
      <span class="bm-icon">${escapeHTML(bookmark.icon)}</span>
      <span class="bm-name">${escapeHTML(bookmark.name)}</span>
    </button>
  `).join("");

  return `
    <div class="browser-wrap">
      <div class="browser-toolbar toolbar">
        <button class="tool" data-browser="back" title="后退" type="button">←</button>
        <button class="tool" data-browser="forward" title="前进" type="button">→</button>
        <button class="tool" data-browser="reload" title="刷新" type="button">⟳</button>
        <button class="tool" data-browser="home" title="主页" type="button">🏠</button>
        <input class="address"
               data-url
               placeholder="输入网址，例如 example.com"
               spellcheck="false"
               autocomplete="url">
        <button class="tool" data-browser="go" title="前往" type="button">前往</button>
        <button class="tool" data-browser="newtab" title="在系统浏览器打开" type="button">↗</button>
      </div>

      <div class="browser-bookmarks">
        ${cards}
      </div>

      <iframe class="browser-frame"
              data-frame
              title="浏览器页面"
              referrerpolicy="no-referrer"></iframe>

      <div class="browser-tip">
        提示：部分网站禁止被内嵌显示，若页面空白请点击 ↗ 在系统浏览器中打开。
      </div>
    </div>
  `;
}

function navigateBrowser(frame, addressInput, value) {
  const raw = String(value || "").trim();
  if (!raw) return;

  let url;
  try {
    const normalized = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw)
      ? raw
      : `https://${raw}`;

    url = new URL(normalized);

    if (!["http:", "https:"].includes(url.protocol)) {
      notify("地址只支持 http 或 https");
      return;
    }
  } catch {
    notify("网址格式不正确");
    return;
  }

  frame.removeAttribute("srcdoc");
  frame.src = url.href;
  addressInput.value = url.href;
}

function bindAppContentEvents(appName, win) {
  const content = win.querySelector(".window-content");
  if (!content) return;

  if (appName === "explorer") {
    content.querySelectorAll(".file-item").forEach(item => {
      item.addEventListener("dblclick", () => {
        const nodeId = item.dataset.fileId;
        const type = item.dataset.fileType;

        if (type === "folder") {
          openApp("explorer", { nodeId });
        } else {
          openApp("notepad", { fileId: nodeId });
        }
      });
    });

    content.querySelectorAll("[data-go-back]").forEach(button => {
      button.addEventListener("click", () => {
        const currentId = button.dataset.current;
        const parent = findParent(currentId);
        if (parent) openApp("explorer", { nodeId: parent.id });
      });
    });

    content.querySelectorAll("[data-go-root]").forEach(button => {
      button.addEventListener("click", () => {
        openApp("explorer", { nodeId: fs.id });
      });
    });
  }

  if (appName === "browser") {
    bindBrowserEvents(content);
  }

  if (appName === "calculator") {
    bindCalculatorEvents(content);
  }

  if (appName === "paint") {
    bindPaintEvents(content);
  }

  if (appName === "terminal") {
    bindTerminalEvents(content);
  }

  if (appName === "notepad") {
    bindNotepadEvents(content);
  }

  if (appName === "settings") {
    content.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
      state.darkMode = !state.darkMode;
      applyTheme();
      openApp("settings");
      notify(state.darkMode ? "已切换到深色模式" : "已切换到浅色模式");
    });
  }
}

function bindBrowserEvents(content) {
  const frame = content.querySelector("[data-frame]");
  const addressInput = content.querySelector("[data-url]");
  if (!frame || !addressInput) return;

  frame.srcdoc = getBrowserHome();

  const go = () => navigateBrowser(frame, addressInput, addressInput.value);

  addressInput.addEventListener("keydown", event => {
    if (event.key === "Enter") go();
  });

  content.querySelectorAll("[data-browser]").forEach(button => {
    button.addEventListener("click", () => {
      switch (button.dataset.browser) {
        case "back":
          try {
            frame.contentWindow?.history.back();
          } catch {
            notify("无法返回上一页");
          }
          break;

        case "forward":
          try {
            frame.contentWindow?.history.forward();
          } catch {
            notify("无法前进");
          }
          break;

        case "reload":
          try {
            if (frame.hasAttribute("srcdoc")) {
              frame.srcdoc = getBrowserHome();
            } else {
              frame.contentWindow?.location.reload();
            }
          } catch {
            frame.src = frame.src;
          }
          break;

        case "home":
          addressInput.value = "";
          frame.removeAttribute("src");
          frame.srcdoc = getBrowserHome();
          break;

        case "go":
          go();
          break;

        case "newtab": {
          const value = addressInput.value.trim();

          if (!value) {
            notify("请先输入网址");
            return;
          }

          let url;
          try {
            const normalized = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)
              ? value
              : `https://${value}`;
            url = new URL(normalized);
          } catch {
            notify("网址格式不正确");
            return;
          }

          if (!["http:", "https:"].includes(url.protocol)) {
            notify("地址只支持 http 或 https");
            return;
          }

          window.open(url.href, "_blank", "noopener,noreferrer");
          break;
        }

        default:
          break;
      }
    });
  });

  content.querySelectorAll("[data-browse-url]").forEach(button => {
    button.addEventListener("click", () => {
      const url = button.dataset.browseUrl;
      addressInput.value = url;
      navigateBrowser(frame, addressInput, url);
    });
  });
}

function bindCalculatorEvents(content) {
  const display = content.querySelector(".calc-display");
  if (!display) return;

  content.querySelectorAll(".calc-key").forEach(button => {
    button.addEventListener("click", () => {
      const value = button.textContent.trim();

      if (value === "C") {
        display.value = "0";
        display.dataset.expr = "";
        return;
      }

      if (value === "=") {
        try {
          const expression = (display.dataset.expr || display.value || "0")
            .replace(/×/g, "*")
            .replace(/÷/g, "/");

          // 只允许数字、小数点、运算符、括号和空格进入计算表达式。
          if (!/^[\d+\-*/().\s]+$/.test(expression)) {
            throw new Error("Invalid expression");
          }

          const result = Function(`"use strict"; return (${expression});`)();
          display.value = Number.isFinite(result) ? String(result) : "Error";
          display.dataset.expr = display.value === "Error" ? "" : display.value;
        } catch {
          display.value = "Error";
          display.dataset.expr = "";
        }
        return;
      }

      const current = display.dataset.expr || "";
      const next = current ? current + value : value;

      display.dataset.expr = next;
      display.value = next;
    });
  });
}

function bindPaintEvents(content) {
  const canvas = content.querySelector("canvas");
  if (!canvas) return;

  const context = canvas.getContext("2d");
  let drawing = false;
  let lastX = 0;
  let lastY = 0;

  const resizeCanvas = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(ratio, ratio);
  };

  resizeCanvas();

  canvas.addEventListener("pointerdown", event => {
    drawing = true;
    canvas.setPointerCapture?.(event.pointerId);

    const rect = canvas.getBoundingClientRect();
    lastX = event.clientX - rect.left;
    lastY = event.clientY - rect.top;
  });

  canvas.addEventListener("pointermove", event => {
    if (!drawing) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const color = content.querySelector("[data-color]")?.value || "#1a73e8";
    const size = Number(content.querySelector("[data-size]")?.value || 5);

    context.beginPath();
    context.moveTo(lastX, lastY);
    context.lineTo(x, y);
    context.strokeStyle = color;
    context.lineWidth = size;
    context.lineCap = "round";
    context.stroke();

    lastX = x;
    lastY = y;
  });

  const stopDrawing = () => {
    drawing = false;
  };

  canvas.addEventListener("pointerup", stopDrawing);
  canvas.addEventListener("pointercancel", stopDrawing);
  canvas.addEventListener("pointerleave", stopDrawing);

  content.querySelector("[data-clear]")?.addEventListener("click", () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
  });
}

function bindTerminalEvents(content) {
  const input = content.querySelector(".terminal-input");
  const output = content.querySelector(".terminal-output");
  if (!input || !output) return;

  input.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;

    const command = input.value.trim();
    if (!command) return;

    const row = document.createElement("div");
    row.className = "terminal-row";

    const prompt = document.createElement("span");
    prompt.className = "terminal-prompt";
    prompt.textContent = "C:\\Users\\User>";

    const commandText = document.createElement("span");
    commandText.textContent = command;

    row.append(prompt, commandText);
    output.appendChild(row);

    const result = runTerminalCommand(command);
    if (result) {
      const resultElement = document.createElement("div");
      resultElement.textContent = result;
      output.appendChild(resultElement);
    }

    input.value = "";
    output.scrollTop = output.scrollHeight;
  });
}

function bindNotepadEvents(content) {
  const textarea = content.querySelector("textarea");
  if (!textarea) return;

  textarea.addEventListener("input", () => {
    const node = findNode(textarea.dataset.fileId);
    if (!node) return;

    node.content = textarea.value;
    saveFS();
  });
}

function runTerminalCommand(command) {
  const lower = command.toLowerCase();

  if (lower === "help") {
    return "help  显示命令帮助\nver   显示版本\ndir   列出桌面目录\nopen  打开应用，例如 open browser\ncls   清屏";
  }

  if (lower === "ver") {
    return "Windows Web Terminal v1.0";
  }

  if (lower === "dir") {
    return (fs.children || []).map(item => item.name).join("\n") || "空目录";
  }

  if (lower === "cls") {
    const output = document.querySelector(".window.focused .terminal-output");
    if (output) output.textContent = "";
    return "";
  }

  if (lower.startsWith("open ")) {
    const appName = lower.slice(5).trim();

    if (APPS[appName]) {
      openApp(appName);
      return `已打开 ${APPS[appName].title}`;
    }

    return `找不到应用：${appName}`;
  }

  return `命令不存在：${command}`;
}

function renderExplorer(nodeId) {
  const currentNode = findNode(nodeId) || fs;
  const parent = currentNode.id !== fs.id ? findParent(currentNode.id) : null;

  const items = (currentNode.children || []).map(item => `
    <div class="file-item"
         data-file-id="${escapeHTML(item.id)}"
         data-file-type="${escapeHTML(item.type)}"
         data-node-id="${escapeHTML(item.id)}">
      <span class="icon">${item.type === "folder" ? "📁" : "📄"}</span>
      <span>${escapeHTML(item.name)}</span>
    </div>
  `).join("");

  return `
    <div class="explorer-layout">
      <aside class="sidebar">
        <div class="nav-item selected">📁 ${escapeHTML(fs.name)}</div>
        <div class="nav-item" data-go-root>🏠 桌面</div>
        ${parent
          ? `<div class="nav-item" data-go-back data-current="${escapeHTML(currentNode.id)}">⬅ 返回上一级</div>`
          : ""}
        <div class="nav-item">📄 文档</div>
        <div class="nav-item">📥 下载</div>
        <div class="nav-item">🖼️ 图片</div>
        <div class="nav-item">🗑️ 回收站</div>
      </aside>

      <div class="files-area">
        <h2>${escapeHTML(currentNode.name)}</h2>
        <div class="file-grid">
          ${items || '<div style="padding:10px;color:#666;">暂无内容</div>'}
        </div>
      </div>
    </div>
  `;
}

function renderNotepad(fileId) {
  const node = findNode(fileId);
  const text = node?.content || "";

  return `
    <textarea class="notepad"
              data-file-id="${escapeHTML(node?.id || "")}"
              aria-label="${escapeHTML(node?.name || "新建记事本.txt")}">${escapeHTML(text)}</textarea>
  `;
}

function renderCalculator() {
  const keys = ["C", "÷", "×", "-", "7", "8", "9", "+", "4", "5", "6", "=", "1", "2", "3", "0", "."];

  return `
    <div class="calc">
      <input class="calc-display" data-expr="" value="0" readonly>
      <div class="calc-grid">
        ${keys.map(key => {
          const className = ["÷", "×", "-", "+"].includes(key)
            ? "operator"
            : key === "="
              ? "equal"
              : "";

          return `<button type="button" class="calc-key ${className}">${key}</button>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderPaint() {
  return `
    <div class="paint-wrap">
      <div class="paint-toolbar">
        <input type="color" data-color value="#1a73e8" aria-label="画笔颜色">
        <input type="range" data-size min="1" max="20" value="5" aria-label="画笔大小">
        <button data-clear type="button">清空</button>
      </div>
      <canvas class="paint-canvas" width="900" height="520"></canvas>
    </div>
  `;
}

function renderTerminal() {
  return `
    <div class="terminal">
      <div class="terminal-output">
        <div>Windows Web Terminal</div>
        <div>键入 help 查看命令列表</div>
      </div>
      <div class="terminal-row">
        <span class="terminal-prompt">C:\\Users\\User&gt;</span>
        <input class="terminal-input" placeholder="输入命令..." autocomplete="off">
      </div>
    </div>
  `;
}

function renderMinesweeper() {
  const cells = Array.from({ length: 81 }, (_, index) =>
    `<button class="mine-cell" data-index="${index}" type="button" aria-label="格子 ${index + 1}"></button>`
  ).join("");

  return `
    <div class="minesweeper">
      <div class="mine-status">
        <span>💣 扫雷</span>
        <span>剩余 10</span>
      </div>
      <div class="mine-grid">${cells}</div>
    </div>
  `;
}

function renderTaskManager() {
  const rows = [
    ["explorer", "资源管理器", "12%", "正常"],
    ["browser", "浏览器", "8%", "正常"],
    ["terminal", "终端", "3%", "正常"],
    ["taskmgr", "任务管理器", "1%", "正常"]
  ];

  return `
    <div class="taskmgr">
      <table class="task-table">
        <thead>
          <tr><th>应用</th><th>进程名</th><th>CPU</th><th>状态</th></tr>
        </thead>
        <tbody>
          ${rows.map(([name, title, cpu, status]) => `
            <tr>
              <td>${escapeHTML(APPS[name]?.icon || "🪟")} ${escapeHTML(APPS[name]?.title || title)}</td>
              <td>${escapeHTML(title)}</td>
              <td>${escapeHTML(cpu)}</td>
              <td>${escapeHTML(status)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPreviousMonth = new Date(year, month, 0).getDate();
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];

  const cells = Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - firstDay + 1;
    let label = dayNumber;
    let className = "calendar-day";

    if (dayNumber < 1) {
      label = daysInPreviousMonth + dayNumber;
      className += " dim";
    } else if (dayNumber > daysInMonth) {
      label = dayNumber - daysInMonth;
      className += " dim";
    } else if (dayNumber === now.getDate()) {
      className += " today";
    }

    return `<div class="${className}">${label}</div>`;
  }).join("");

  return `
    <div class="calendar">
      <div class="calendar-head">
        <span></span>
        <strong>${year} 年 ${month + 1} 月</strong>
        <span></span>
      </div>
      <div class="calendar-grid">
        ${weekdays.map(day => `<div class="calendar-weekday">${day}</div>`).join("")}
        ${cells}
      </div>
    </div>
  `;
}

function renderMedia() {
  const tracks = [
    { name: "A Moment", time: "02:41" },
    { name: "Night City", time: "03:45" },
    { name: "Clouds", time: "04:16" }
  ];

  return `
    <div class="media">
      <div class="media-now">
        <div class="media-disc">♫</div>
        <div>
          <h3 style="margin:0">Now Playing</h3>
          <div style="color:#666;margin-top:6px">Night City</div>
        </div>
      </div>
      ${tracks.map(track => `
        <div class="media-track">
          <span>${escapeHTML(track.name)}</span>
          <span style="margin-left:auto;color:#666">${escapeHTML(track.time)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSettings() {
  return `
    <div class="settings">
      <h2>设置</h2>
      <div class="settings-grid">
        <div class="setting-card">
          <h3>外观</h3>
          <p>切换深色或浅色主题，适应不同工作环境。</p>
          <button data-theme-toggle type="button">
            ${state.darkMode ? "浅色模式" : "深色模式"}
          </button>
        </div>
        <div class="setting-card">
          <h3>系统</h3>
          <p>管理应用、存储空间与通知设置。</p>
          <button type="button" data-settings-action="system">打开设置</button>
        </div>
        <div class="setting-card">
          <h3>更新</h3>
          <p>检查系统更新并安装最新补丁。</p>
          <button type="button" data-settings-action="update">检查更新</button>
        </div>
      </div>
    </div>
  `;
}

function renderTrash() {
  return `
    <div class="trash-area">
      <h2>回收站</h2>
      <p>当前回收站为空。</p>
    </div>
  `;
}

function renderAbout() {
  return `
    <div class="about">
      <div class="about-card">
        <h2>Windows Web Pro</h2>
        <p>这是一个 Windows 风格的网页桌面示例。</p>
        <p>支持桌面应用快捷方式、任务栏、窗口管理、资源管理器、浏览器、记事本、计算器和终端。</p>
        <p>技术栈：HTML + CSS + JavaScript</p>
      </div>
    </div>
  `;
}
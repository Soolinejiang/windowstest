const state = {
  windows: new Map(),
  zIndex: 100,
  notifications: [],
  toastTimer: null,
  dragState: null,
  clipboard: { mode: "none", nodeId: null },
  darkMode: false
};

document.addEventListener("DOMContentLoaded", () => {
  state.darkMode = localStorage.getItem("windows-web-theme") === "dark";
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
  localStorage.setItem("windows-web-theme", state.darkMode ? "dark" : "light");
}

function notify(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}

function addNotification(msg) {
  state.notifications.unshift(String(msg));
  const card = document.getElementById("notificationCard");
  if (!card) return;
  card.innerHTML = "";
  state.notifications.slice(0, 6).forEach(item => {
    const row = document.createElement("div");
    row.textContent = item;
    card.appendChild(row);
  });
}

function clearNotifications() {
  state.notifications = [];
  const card = document.getElementById("notificationCard");
  if (card) card.innerHTML = "暂无通知";
}

function renderDesktop() {
  const desktop = document.getElementById("desktop");
  if (!desktop) return;

  desktop.innerHTML = "";

  const items = fs.children || [];
  items.forEach(item => {
    const node = document.createElement("div");
    node.className = "desktop-icon";
    node.dataset.nodeId = item.id;

    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = item.type === "folder" ? "📁" : "📄";

    const name = document.createElement("div");
    name.textContent = item.name;

    node.appendChild(icon);
    node.appendChild(name);

    node.addEventListener("dblclick", () => {
      if (item.type === "folder") {
        openApp("explorer", { nodeId: item.id });
      } else {
        openApp("notepad", { fileId: item.id });
      }
    });

    desktop.appendChild(node);
  });

  Object.entries(APPS).forEach(([key, app]) => {
    const iconEl = document.createElement("div");
    iconEl.className = "desktop-icon";
    iconEl.dataset.appLaunch = key;
    iconEl.title = `双击打开 ${app.title}`;

    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = app.icon;

    const name = document.createElement("div");
    name.textContent = app.title;

    iconEl.appendChild(icon);
    iconEl.appendChild(name);

    iconEl.addEventListener("dblclick", () => openApp(key));
    desktop.appendChild(iconEl);
  });
}

function renderAppGrid() {
  const container = document.getElementById("appGrid");
  if (!container) return;

  container.innerHTML = Object.entries(APPS)
    .map(([key, app]) => `
      <button class="app-card" data-launch="${key}" type="button">
        <span class="icon">${app.icon}</span>
        <span class="name">${app.title}</span>
      </button>
    `)
    .join("");
}

function renderTaskbar() {
  const container = document.getElementById("taskButtons");
  if (!container) return;

  const apps = [...state.windows.keys()];
  const focusedApp = document.querySelector(".window.focused")?.dataset.app;

  container.innerHTML = apps
    .map(appName => {
      const app = APPS[appName];
      if (!app) return "";
      return `
        <button
          class="task-btn ${appName === focusedApp ? "active" : ""}"
          data-task-app="${appName}"
          type="button"
        >
          <span>${app.icon}</span>
          <span class="title">${app.title}</span>
        </button>
      `;
    })
    .join("");
}

function bindGlobalEvents() {
  document.getElementById("startButton")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = document.getElementById("startMenu");
    const shouldShow = !menu.classList.contains("show");
    closePanels();
    if (menu) menu.classList.toggle("show", shouldShow);
  });

  document.getElementById("allAppsBtn")?.addEventListener("click", () => {
    const menu = document.getElementById("startMenu");
    const input = document.getElementById("startSearch");
    if (menu) menu.classList.add("show");
    if (input) input.focus();
  });

  document.getElementById("quickButton")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const panel = document.getElementById("notifications");
    const shouldShow = !panel.classList.contains("show");
    closePanels();
    if (panel) panel.classList.toggle("show", shouldShow);
  });

  document.getElementById("clockButton")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const panel = document.getElementById("notifications");
    const shouldShow = !panel.classList.contains("show");
    closePanels();
    if (panel) panel.classList.toggle("show", shouldShow);
  });

  document.getElementById("clearNotifications")?.addEventListener("click", clearNotifications);

  document.getElementById("taskSearchInput")?.addEventListener("input", (event) => {
    const q = event.target.value.trim().toLowerCase();
    const cards = document.querySelectorAll(".app-card");
    cards.forEach(card => {
      const text = (card.textContent || "").toLowerCase();
      card.style.display = text.includes(q) ? "flex" : "none";
    });
  });

  document.getElementById("startSearch")?.addEventListener("input", (event) => {
    const q = event.target.value.trim().toLowerCase();
    const cards = document.querySelectorAll(".app-card");
    cards.forEach(card => {
      const text = (card.textContent || "").toLowerCase();
      card.style.display = text.includes(q) ? "flex" : "none";
    });
  });

  document.addEventListener("click", (event) => {
    const launch = event.target.closest("[data-launch]");
    if (launch) {
      openApp(launch.dataset.launch);
      document.getElementById("startMenu")?.classList.remove("show");
      return;
    }

    const taskBtn = event.target.closest("[data-task-app]");
    if (taskBtn) {
      const appName = taskBtn.dataset.taskApp;
      const win = state.windows.get(appName);
      if (win) {
        win.classList.remove("minimized");
        win.classList.add("show");
        focusWindow(win);
      }
      return;
    }

    const ctxAction = event.target.closest("[data-context-action]");
    if (ctxAction) {
      handleContextAction(ctxAction.dataset.contextAction, ctxAction.dataset.nodeId);
      return;
    }

    if (!event.target.closest(".context-menu") &&
        !event.target.closest("#desktop") &&
        !event.target.closest(".desktop-icon")) {
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

  document.addEventListener("contextmenu", (event) => {
    const desktopTarget = event.target.closest("#desktop");
    if (desktopTarget) {
      event.preventDefault();
      showDesktopContextMenu(event.clientX, event.clientY);
      return;
    }

    const nodeItem = event.target.closest("[data-node-id]");
    if (nodeItem) {
      event.preventDefault();
      showNodeContextMenu(nodeItem.dataset.nodeId, event.clientX, event.clientY);
    }
  });

  document.addEventListener("pointerdown", (event) => {
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

  document.addEventListener("pointermove", (event) => {
    if (!state.dragState) return;

    const { win, offsetX, offsetY } = state.dragState;
    win.style.left = `${event.clientX - offsetX}px`;
    win.style.top = `${event.clientY - offsetY}px`;
    win.style.transform = "none";
  });

  document.addEventListener("pointerup", () => {
    state.dragState = null;
  });
}

function closePanels() {
  document.getElementById("startMenu")?.classList.remove("show");
  document.getElementById("notifications")?.classList.remove("show");
  document.getElementById("contextMenu")?.classList.remove("show");
}

function showContextMenuHTML(html, x, y) {
  const menu = document.getElementById("contextMenu");
  if (!menu) return;

  menu.innerHTML = html;
  menu.classList.add("show");

  const width = menu.offsetWidth || 180;
  const height = menu.offsetHeight || 200;

  menu.style.left = `${Math.min(x, window.innerWidth - width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - height - 8)}px`;
}

function showDesktopContextMenu(x, y) {
  const hasClipboard = state.clipboard.mode !== "none" && state.clipboard.nodeId;
  showContextMenuHTML(`
    <button type="button" data-context-action="new-folder">新建文件夹</button>
    <button type="button" data-context-action="new-file">新建文件</button>
    ${hasClipboard ? `<button type="button" data-context-action="paste" data-node-id="${fs.id}">粘贴</button>` : ""}
    <div class="separator"></div>
    <button type="button" data-context-action="refresh">刷新</button>
  `, x, y);
}

function showNodeContextMenu(nodeId, x, y) {
  const node = findNode(nodeId);
  if (!node) return;
  const hasClipboard = state.clipboard.mode !== "none" && state.clipboard.nodeId;

  showContextMenuHTML(`
    <button type="button" data-context-action="open-node" data-node-id="${nodeId}">
      ${node.type === "folder" ? "打开" : "打开文件"}
    </button>
    <button type="button" data-context-action="rename" data-node-id="${nodeId}">重命名</button>
    <button type="button" data-context-action="copy" data-node-id="${nodeId}">复制</button>
    <button type="button" data-context-action="cut" data-node-id="${nodeId}">剪切</button>
    <button type="button" data-context-action="delete" data-node-id="${nodeId}">删除</button>
    ${hasClipboard && node.type === "folder" ? `<button type="button" data-context-action="paste" data-node-id="${nodeId}">粘贴到这里</button>` : ""}
    <div class="separator"></div>
    <button type="button" data-context-action="refresh">刷新</button>
  `, x, y);
}

function handleContextAction(action, nodeId) {
  document.getElementById("contextMenu")?.classList.remove("show");

  switch (action) {
    case "refresh":
      renderDesktop();
      notify("已刷新桌面");
      break;

    case "new-folder": {
      const name = prompt("请输入文件夹名称", "新建文件夹");
      if (!name || !name.trim()) break;
      createNode(fs.id, "folder", name.trim());
      renderDesktop();
      notify("已创建文件夹");
      break;
    }

    case "new-file": {
      const name = prompt("请输入文件名", "新建文件.txt");
      if (!name || !name.trim()) break;
      createNode(fs.id, "file", name.trim());
      renderDesktop();
      notify("已创建文件");
      break;
    }

    case "open-node": {
      if (!nodeId) break;
      const node = findNode(nodeId);
      if (!node) break;

      if (node.type === "folder") {
        openApp("explorer", { nodeId: node.id });
      } else {
        openApp("notepad", { fileId: node.id });
      }
      break;
    }

    case "rename": {
      if (!nodeId) break;
      const node = findNode(nodeId);
      if (!node) break;

      const newName = prompt("请输入新名称", node.name);
      if (!newName || !newName.trim()) break;

      if (renameNode(nodeId, newName.trim())) {
        renderDesktop();
        refreshExplorerWindows();
        notify("已重命名");
      }
      break;
    }

    case "copy": {
      if (!nodeId) break;
      if (!findNode(nodeId)) break;

      state.clipboard = { mode: "copy", nodeId };
      notify("已复制");
      break;
    }

    case "cut": {
      if (!nodeId) break;
      if (!findNode(nodeId)) break;

      state.clipboard = { mode: "cut", nodeId };
      notify("已剪切");
      break;
    }

    case "paste": {
      const targetFolderId = nodeId || fs.id;
      const targetFolder = findNode(targetFolderId);

      if (!targetFolder || targetFolder.type !== "folder") {
        notify("目标位置不是文件夹");
        break;
      }

      if (!state.clipboard.nodeId) {
        notify("剪贴板为空");
        break;
      }

      const sourceNode = findNode(state.clipboard.nodeId);

      if (!sourceNode) {
        notify("源文件不存在");
        break;
      }

      if (state.clipboard.mode === "copy") {
        const ok = pasteNodeIntoFolder(state.clipboard.nodeId, targetFolderId);
        if (ok) {
          renderDesktop();
          refreshExplorerWindows();
          notify("已粘贴");
        } else {
          notify("粘贴失败");
        }
      } else if (state.clipboard.mode === "cut") {
        const ok = moveNode(state.clipboard.nodeId, targetFolderId);
        if (ok) {
          renderDesktop();
          refreshExplorerWindows();
          notify("已移动");
        } else {
          notify("移动失败");
        }
      }

      state.clipboard = { mode: "none", nodeId: null };
      break;
    }

    case "delete": {
      if (!nodeId) break;
      if (!confirm("确定删除该项吗？")) break;

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
  state.windows.forEach((win, appName) => {
    if (appName === "explorer") {
      const currentId = win.dataset.currentFolder || fs.id;
      const content = win.querySelector(".window-content");
      if (content) {
        content.innerHTML = renderExplorer(currentId);
        bindAppContentEvents("explorer", win);
      }
    }
  });
}

function focusWindow(win) {
  document.querySelectorAll(".window").forEach(el => el.classList.remove("focused"));
  win.classList.add("focused");
  win.style.zIndex = ++state.zIndex;
  renderTaskbar();
}

function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });

  const timeEl = document.getElementById("clockTime");
  const dateEl = document.getElementById("clockDate");

  if (timeEl) timeEl.textContent = time;
  if (dateEl) dateEl.textContent = date;
}

function openApp(appName, options = {}) {
  if (!APPS[appName]) return;

  let win = state.windows.get(appName);
  if (!win) {
    win = createWindow(appName);
    state.windows.set(appName, win);
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
  win.style.left = `${120 + total * 36}px`;
  win.style.top = `${70 + total * 22}px`;

  win.innerHTML = `
    <header class="titlebar">
      <div class="window-title">
        <span>${app.icon}</span>
        <span>${app.title}</span>
      </div>
      <div class="window-controls">
        <button type="button" data-window="minimize" title="最小化">—</button>
        <button type="button" data-window="maximize" title="最大化">□</button>
        <button type="button" class="close" data-window="close" title="关闭">✕</button>
      </div>
    </header>
    <div class="window-content"></div>
  `;

  document.body.appendChild(win);

  win.querySelectorAll("[data-window]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      const action = btn.dataset.window;
      if (action === "close") {
        win.remove();
        state.windows.delete(appName);
        renderTaskbar();
      }

      if (action === "minimize") {
        win.classList.add("minimized");
        renderTaskbar();
      }

      if (action === "maximize") {
        win.classList.toggle("maximized");
      }
    });
  });

  return win;
}

function renderAppContent(appName, options = {}) {
  switch (appName) {
    case "explorer":
      return renderExplorer(options.nodeId || fs.id);

    case "browser":
      return renderBrowser();

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
      return `<div style="padding:30px;">${APPS[appName]?.title || "应用"}尚未实现</div>`;
  }
}

function bindAppContentEvents(appName, win) {
  const content = win.querySelector(".window-content");
  if (!content) return;

  if (appName === "explorer") {
    content.querySelectorAll(".file-item").forEach(item => {
      item.addEventListener("click", () => {
        const nodeId = item.dataset.fileId;
        const type = item.dataset.fileType;
        if (type === "folder") {
          openApp("explorer", { nodeId });
        } else if (type === "file") {
          openApp("notepad", { fileId: nodeId });
        }
      });
    });

    content.querySelectorAll("[data-go-back]").forEach(btn => {
      btn.addEventListener("click", () => {
        const currentId = btn.dataset.current;
        const current = findNode(currentId);
        const parent = current ? findParent(currentId) : null;
        if (parent) openApp("explorer", { nodeId: parent.id });
      });
    });

    content.querySelectorAll("[data-go-root]").forEach(btn => {
      btn.addEventListener("click", () => {
        openApp("explorer", { nodeId: fs.id });
      });
    });
  }

  if (appName === "browser") {
    const iframe = content.querySelector(".browser-frame");
    const input = content.querySelector(".address");
    if (!iframe || !input) return;

    iframe.src = "https://www.bing.com/";

    content.querySelectorAll("[data-browser]").forEach(btn => {
      btn.addEventListener("click", () => {
        const cmd = btn.dataset.browser;
        const value = input.value.trim();

        if (cmd === "go" && value) iframe.src = value;
        if (cmd === "back") iframe.contentWindow?.history.back();
        if (cmd === "forward") iframe.contentWindow?.history.forward();
        if (cmd === "home") iframe.src = "https://www.bing.com/";
      });
    });

    content.querySelectorAll(".bm-card").forEach(btn => {
      btn.addEventListener("click", () => {
        const url = btn.dataset.url;
        if (url) iframe.src = url;
      });
    });
  }

  if (appName === "calculator") {
    content.querySelectorAll(".calc-key").forEach(btn => {
      btn.addEventListener("click", () => {
        const display = content.querySelector(".calc-display");
        const value = btn.textContent.trim();

        if (!display) return;

        if (value === "C") {
          display.value = "0";
          display.dataset.expr = "";
          return;
        }

        if (value === "=") {
          try {
            const expr = (display.dataset.expr || display.value || "0")
              .replace(/×/g, "*")
              .replace(/÷/g, "/");
            const result = Function(`"use strict"; return (${expr});`)();
            display.value = Number.isFinite(result) ? String(result) : "Error";
            display.dataset.expr = display.value;
          } catch {
            display.value = "Error";
            display.dataset.expr = "";
          }
          return;
        }

        const current = display.dataset.expr || "0";
        const next = current === "0" ? value : current + value;
        display.dataset.expr = next;
        display.value = next;
      });
    });
  }

  if (appName === "terminal") {
    const input = content.querySelector(".terminal-input");
    const output = content.querySelector(".terminal-output");
    if (!input || !output) return;

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;

      const cmd = input.value.trim();
      if (!cmd) return;

      input.value = "";

      if (/^(cls|clear)$/i.test(cmd)) {
        output.replaceChildren();
        return;
      }

      const row = document.createElement("div");
      row.className = "terminal-row";

      const prompt = document.createElement("span");
      prompt.className = "terminal-prompt";
      prompt.textContent = "C:\\Users\\User>";

      const command = document.createElement("span");
      command.textContent = cmd;

      row.append(prompt, command);
      output.appendChild(row);

      const result = runTerminalCommand(cmd);
      if (result) {
        const resultElement = document.createElement("div");
        resultElement.textContent = result;
        output.appendChild(resultElement);
      }

      output.scrollTop = output.scrollHeight;
    });
  }

  if (appName === "paint") {
    const canvas = content.querySelector(".paint-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let drawing = false;
    let lastX = 0;
    let lastY = 0;
    let pixelRatio = window.devicePixelRatio || 1;
    let hasInitializedSize = false;

    const resizeCanvas = () => {
      if (!canvas.isConnected) return;

      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const nextRatio = window.devicePixelRatio || 1;
      let snapshot = null;

      if (hasInitializedSize && canvas.width && canvas.height) {
        snapshot = document.createElement("canvas");
        snapshot.width = canvas.width;
        snapshot.height = canvas.height;
        const snapshotCtx = snapshot.getContext("2d");
        if (snapshotCtx) {
          snapshotCtx.drawImage(canvas, 0, 0);
        }
      }

      canvas.width = Math.max(1, Math.round(rect.width * nextRatio));
      canvas.height = Math.max(1, Math.round(rect.height * nextRatio));
      pixelRatio = nextRatio;

      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      if (snapshot) {
        const oldWidth = canvas.width / pixelRatio;
        const oldHeight = canvas.height / pixelRatio;
        const prevWidth = snapshot.width / pixelRatio;
        const prevHeight = snapshot.height / pixelRatio;

        ctx.drawImage(
          snapshot,
          0,
          0,
          prevWidth,
          prevHeight,
          0,
          0,
          oldWidth,
          oldHeight
        );
      }

      hasInitializedSize = true;
    };

    const getPoint = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    };

    resizeCanvas();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        if (!canvas.isConnected) {
          observer.disconnect();
          return;
        }
        resizeCanvas();
      });
      observer.observe(canvas);
    }

    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;

      drawing = true;
      canvas.setPointerCapture?.(event.pointerId);

      const point = getPoint(event);
      lastX = point.x;
      lastY = point.y;
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!drawing) return;

      const point = getPoint(event);
      const color = content.querySelector("[data-color]")?.value || "#1a73e8";
      const size = Number(content.querySelector("[data-size]")?.value || 5);

      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      lastX = point.x;
      lastY = point.y;
    });

    const stopDrawing = () => {
      drawing = false;
    };

    canvas.addEventListener("pointerup", stopDrawing);
    canvas.addEventListener("pointercancel", stopDrawing);
    canvas.addEventListener("lostpointercapture", stopDrawing);

    content.querySelector("[data-clear]")?.addEventListener("click", () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
    });
  }

  if (appName === "minesweeper") {
    bindMinesweeperEvents(content);
  }

  if (appName === "notepad") {
    const textarea = content.querySelector("textarea");
    if (!textarea) return;

    textarea.addEventListener("input", () => {
      const fileId = textarea.dataset.fileId;
      if (!fileId) return;
      const node = findNode(fileId);
      if (node) {
        node.content = textarea.value;
        saveFS();
      }
    });
  }

  if (appName === "settings") {
    content.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
      state.darkMode = !state.darkMode;
      applyTheme();
      notify(state.darkMode ? "已切换到深色模式" : "已切换到浅色模式");
    });
  }
}

function bindMinesweeperEvents(content) {
  const grid = content.querySelector(".mine-grid");
  const status = content.querySelector(".mine-status-text");
  const restartButton = content.querySelector("[data-mine-restart]");

  if (!grid || !status) return;

  const size = 9;
  const mineCount = 10;

  let cells = [];
  let started = false;
  let gameOver = false;
  let flags = 0;
  let revealedCount = 0;

  const neighborsOf = (index) => {
    const row = Math.floor(index / size);
    const col = index % size;
    const neighbors = [];

    for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
      for (let colOffset = -1; colOffset <= 1; colOffset++) {
        if (rowOffset === 0 && colOffset === 0) continue;

        const nextRow = row + rowOffset;
        const nextCol = col + colOffset;

        if (nextRow >= 0 && nextRow < size && nextCol >= 0 && nextCol < size) {
          neighbors.push(nextRow * size + nextCol);
        }
      }
    }

    return neighbors;
  };

  const updateStatus = (message = "") => {
    status.textContent = message || `剩余 ${Math.max(0, mineCount - flags)} 面旗`;
  };

  const render = () => {
    grid.querySelectorAll(".mine-cell").forEach((button, index) => {
      const cell = cells[index];
      if (!cell) return;

      button.classList.toggle("open", cell.revealed);
      button.classList.toggle("flagged", cell.flagged);
      button.classList.toggle("mine", gameOver && cell.mine);

      if (cell.flagged && !cell.revealed) {
        button.textContent = "🚩";
      } else if (cell.revealed && cell.mine) {
        button.textContent = "💣";
      } else if (cell.revealed && cell.neighborCount > 0) {
        button.textContent = String(cell.neighborCount);
        button.dataset.count = String(cell.neighborCount);
      } else {
        button.textContent = "";
        delete button.dataset.count;
      }

      button.disabled = gameOver || cell.revealed;
    });
  };

  const startGame = (safeIndex = null) => {
    cells = Array.from({ length: size * size }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      neighborCount: 0
    }));

    const safeCells = new Set(safeIndex === null ? [] : [safeIndex, ...neighborsOf(safeIndex)]);

    const mineCandidates = Array.from({ length: size * size }, (_, index) => index)
      .filter(index => !safeCells.has(index));

    for (let index = mineCandidates.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [mineCandidates[index], mineCandidates[swapIndex]] = [mineCandidates[swapIndex], mineCandidates[index]];
    }

    mineCandidates.slice(0, mineCount).forEach(index => {
      cells[index].mine = true;
    });

    cells.forEach((cell, index) => {
      if (cell.mine) return;
      cell.neighborCount = neighborsOf(index).filter(neighborIndex => cells[neighborIndex].mine).length;
    });

    started = true;
    gameOver = false;
    flags = 0;
    revealedCount = 0;
    updateStatus();
    render();
  };

  const finishGame = (won) => {
    gameOver = true;
    updateStatus(won ? "恭喜，扫雷成功！" : "踩到地雷，游戏结束。");
    render();
  };

  const reveal = (index) => {
    const cell = cells[index];
    if (!cell || cell.revealed || cell.flagged || gameOver) return;

    cell.revealed = true;

    if (cell.mine) {
      finishGame(false);
      return;
    }

    revealedCount += 1;

    if (cell.neighborCount === 0) {
      neighborsOf(index).forEach(neighborIndex => {
        if (!cells[neighborIndex].revealed) reveal(neighborIndex);
      });
    }

    if (revealedCount === size * size - mineCount) {
      finishGame(true);
      return;
    }

    updateStatus();
    render();
  };

  grid.addEventListener("click", (event) => {
    const button = event.target.closest(".mine-cell");
    if (!button || gameOver) return;

    const index = Number(button.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= cells.length) return;

    if (!started) {
      startGame(index);
    }

    reveal(index);
  });

  grid.addEventListener("contextmenu", (event) => {
    const button = event.target.closest(".mine-cell");
    if (!button) return;

    event.preventDefault();
    if (gameOver) return;

    const index = Number(button.dataset.index);
    const cell = cells[index];
    if (!cell || cell.revealed) return;

    cell.flagged = !cell.flagged;
    flags += cell.flagged ? 1 : -1;
    updateStatus();
    render();
  });

  restartButton?.addEventListener("click", () => {
    startGame();
  });

  startGame();
}

function runTerminalCommand(cmd) {
  const lower = cmd.toLowerCase();

  if (lower === "help") {
    return [
      "help  显示命令帮助",
      "ver   显示版本",
      "dir   列出目录",
      "ls    列出目录",
      "pwd   显示当前目录",
      "open  打开应用",
      "apps  显示应用列表",
      "mkdir 创建目录",
      "touch 创建文件",
      "cat   查看文件内容",
      "rename 重命名",
      "del   删除文件/目录",
      "copy  复制",
      "move  移动",
      "theme 切换主题",
      "tree  显示目录树",
      "cls   清屏",
      "date  当前日期",
      "time  当前时间",
      "whoami 当前用户"
    ].join("\n");
  }

  if (lower === "ver") return "Windows Web Terminal v1.0";
  if (lower === "date") return new Date().toLocaleDateString("zh-CN");
  if (lower === "time") return new Date().toLocaleTimeString("zh-CN");
  if (lower === "whoami") return "windows-web\\user";

  if (lower === "pwd") return "C:\\Users\\User\\Desktop";
  if (lower === "dir" || lower === "ls") return (fs.children || []).map(item => item.name).join("\n") || "空目录";

  if (lower === "cls" || lower === "clear") {
    const terminal = document.querySelector(".terminal-output");
    if (terminal) terminal.innerHTML = "";
    return "";
  }

  if (lower === "apps") {
    return Object.entries(APPS).map(([key, app]) => `${key} - ${app.title}`).join("\n");
  }

  if (lower.startsWith("open ")) {
    const appKey = lower.replace("open ", "").trim();
    if (APPS[appKey]) {
      openApp(appKey);
      return `已打开 ${APPS[appKey].title}`;
    }
    return `找不到应用: ${appKey}`;
  }

  if (lower === "theme dark") {
    state.darkMode = true;
    applyTheme();
    return "已切换到深色模式";
  }

  if (lower === "theme light") {
    state.darkMode = false;
    applyTheme();
    return "已切换到浅色模式";
  }

  if (lower === "theme toggle") {
    state.darkMode = !state.darkMode;
    applyTheme();
    return state.darkMode ? "已切换到深色模式" : "已切换到浅色模式";
  }

  if (lower === "tree") {
    const lines = [];
    function walk(node, prefix = "") {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const isLast = i === node.children.length - 1;
        lines.push(`${prefix}${isLast ? "└─" : "├─"} ${child.name}`);
        if (child.type === "folder") {
          walk(child, prefix + (isLast ? "   " : "│  "));
        }
      }
    }
    walk(fs);
    return lines.join("\n") || "空目录";
  }

  if (lower.startsWith("mkdir ")) {
    const name = cmd.slice(6).trim();
    if (!name) return "用法: mkdir <文件夹名>";
    const created = createNode(fs.id, "folder", name);
    if (created) {
      renderDesktop();
      return `已创建文件夹: ${name}`;
    }
    return "创建失败，可能存在同名项目";
  }

  if (lower.startsWith("touch ")) {
    const name = cmd.slice(6).trim();
    if (!name) return "用法: touch <文件名>";
    const created = createNode(fs.id, "file", name);
    if (created) {
      renderDesktop();
      return `已创建文件: ${name}`;
    }
    return "创建失败，可能存在同名项目";
  }

  if (lower.startsWith("cat ")) {
    const name = cmd.slice(4).trim();
    const node = findNodeByName(name);
    if (!node || node.type !== "file") return "找不到该文件";
    return node.content || "（文件内容为空）";
  }

  if (lower.startsWith("rename ")) {
    const parts = cmd.split(/\s+/);
    if (parts.length < 3) return "用法: rename <原名> <新名>";
    const oldName = parts[1];
    const newName = parts[2];
    const node = findNodeByName(oldName);
    if (!node) return "找不到该项";
    if (renameNode(node.id, newName)) {
      renderDesktop();
      refreshExplorerWindows();
      return `已重命名: ${newName}`;
    }
    return "重命名失败";
  }

  if (lower.startsWith("del ") || lower.startsWith("rm ")) {
    const name = cmd.slice(lower.startsWith("del ") ? 4 : 3).trim();
    const node = findNodeByName(name);
    if (!node || node.id === fs.id) return "无法删除根目录或不存在";
    if (deleteNode(node.id)) {
      renderDesktop();
      refreshExplorerWindows();
      return `已删除: ${node.name}`;
    }
    return "删除失败";
  }

  return `命令不存在: ${cmd}`;
}

function findNodeByName(name) {
  const target = name.trim();
  if (!target) return null;

  const walk = (node) => {
    if (!node) return null;
    if (node.type === "folder") {
      if (node.name.toLowerCase() === target.toLowerCase()) return node;
      for (const child of node.children || []) {
        const found = walk(child);
        if (found) return found;
      }
    } else {
      if (node.name.toLowerCase() === target.toLowerCase()) return node;
    }
    return null;
  };
  return walk(fs);
}

function renderExplorer(nodeId) {
  const currentNode = findNode(nodeId) || fs;
  const children = currentNode.children || [];
  const parent = currentNode.id !== fs.id ? findParent(currentNode.id) : null;

  const items = children.map(item => `
    <div class="file-item" data-file-id="${item.id}" data-file-type="${item.type}">
      <span class="icon">${item.type === "folder" ? "📁" : "📄"}</span>
      <span>${item.name}</span>
    </div>
  `).join("");

  return `
    <div class="explorer-layout">
      <aside class="sidebar">
        <div class="nav-item selected">📁 ${fs.name}</div>
        <div class="nav-item" data-go-root>🏠 根目录</div>
        ${parent ? `<div class="nav-item" data-go-back data-current="${currentNode.id}">⬅ 返回上一级</div>` : ""}
        <div class="nav-item">📄 文档</div>
        <div class="nav-item">📥 下载</div>
        <div class="nav-item">🖼️ 图片</div>
        <div class="nav-item">🗑️ 回收站</div>
      </aside>
      <div class="files-area">
        <h2>${currentNode.name}</h2>
        <div class="file-grid">
          ${items || '<div style="padding:10px;color:#666;">暂无内容</div>'}
        </div>
      </div>
    </div>
  `;
}

function renderBrowser() {
  return `
    <div class="browser-wrap">
      <div class="browser-toolbar">
        <button data-browser="back" type="button">←</button>
        <button data-browser="forward" type="button">→</button>
        <button data-browser="home" type="button">⌂</button>
        <input class="address" value="https://www.bing.com/" />
        <button data-browser="go" type="button">Go</button>
      </div>
      <div class="browser-bookmarks">
        ${BOOKMARKS.map(item => `
          <button class="bm-card" data-url="${item.url}" type="button">
            <span>${item.icon}</span>
            <span>${item.name}</span>
          </button>
        `).join("")}
      </div>
      <iframe class="browser-frame" src="https://www.bing.com/" title="browser"></iframe>
    </div>
  `;
}

function renderNotepad(fileId) {
  const file = findNode(fileId) || { id: "tmp", name: "新建记事本.txt", content: "" };
  return `
    <textarea class="notepad" data-file-id="${file.id}">${file.content || ""}</textarea>
  `;
}

function renderCalculator() {
  const keys = ["C", "/", "*", "-", "7", "8", "9", "+", "4", "5", "6", "=", "1", "2", "3", "0", "."];
  return `
    <div class="calc">
      <input class="calc-display" value="0" readonly />
      <div class="calc-grid">
        ${keys.map(key => `<button class="calc-key">${key}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderPaint() {
  return `
    <div class="paint-wrap">
      <div class="paint-toolbar">
        <input type="color" data-color value="#1a73e8" />
        <input type="range" data-size min="1" max="20" value="5" />
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
        <input class="terminal-input" placeholder="输入命令..." />
      </div>
    </div>
  `;
}

function renderMinesweeper() {
  const cells = [];

  for (let index = 0; index < 81; index++) {
    cells.push(`
      <button
        class="mine-cell"
        type="button"
        data-index="${index}"
        aria-label="第 ${index + 1} 格，未揭开"
      ></button>
    `);
  }

  return `
    <div class="minesweeper">
      <div class="mine-status">
        <span>💣 扫雷</span>
        <span class="mine-status-text" aria-live="polite">剩余 10 面旗</span>
        <button data-mine-restart type="button">重新开始</button>
      </div>
      <div class="mine-grid">
        ${cells.join("")}
      </div>
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
          <tr>
            <th>应用</th>
            <th>进程名</th>
            <th>CPU</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(([name, title, cpu, status]) => `
            <tr>
              <td>${APPS[name]?.icon || "🪟"} ${APPS[name]?.title || title}</td>
              <td>${title}</td>
              <td>${cpu}</td>
              <td>${status}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCalendar() {
  const weeks = ["日", "一", "二", "三", "四", "五", "六"];
  const dayCells = [];
  for (let i = 0; i < 42; i++) {
    const isToday = i === 12;
    dayCells.push(`<div class="calendar-day ${isToday ? "today" : ""}">${i + 1}</div>`);
  }

  return `
    <div class="calendar">
      <div class="calendar-head">
        <button>‹</button>
        <strong>2026 年 11 月</strong>
        <button>›</button>
      </div>
      <div class="calendar-grid">
        ${weeks.map(day => `<div class="calendar-weekday">${day}</div>`).join("")}
        ${dayCells.join("")}
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
          <div style="color:#666;margin-top:6px;">Night City</div>
        </div>
      </div>
      ${tracks.map(track => `
        <div class="media-track">
          <span>${track.name}</span>
          <span style="margin-left:auto;color:#666;">${track.time}</span>
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
          <button type="button">打开设置</button>
        </div>
        <div class="setting-card">
          <h3>更新</h3>
          <p>检查系统更新并安装最新补丁。</p>
          <button type="button">检查更新</button>
        </div>
      </div>
    </div>
  `;
}

function renderTrash() {
  return `
    <div class="trash-area">
      <h2>回收站</h2>
      <div class="file-grid">
        <div class="file-item"><span class="icon">📄</span><span>已删除文件</span></div>
        <div class="file-item"><span class="icon">📁</span><span>清理目录</span></div>
      </div>
    </div>
  `;
}

function renderAbout() {
  return `
    <div class="about">
      <div class="about-card">
        <h2>Windows Web Pro</h2>
        <p>这是一个增强版的 Windows 风格网页桌面，保留原有交互体验，同时补齐了文件管理与应用操作的完整闭环。</p>
        <p>支持：桌面图标、开始菜单、任务栏、窗口管理、资源管理器、浏览器、记事本、计算器、终端等。</p>
        <p>技术栈：HTML + CSS + JavaScript</p>
      </div>
    </div>
  `;
}
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

function applyTheme() {
  document.body.classList.toggle("dark", state.darkMode);
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
  state.notifications.unshift(msg);

  const card = document.getElementById("notificationCard");
  if (card) {
    card.innerHTML = state.notifications
      .slice(0, 6)
      .map(item => `<div>${item}</div>`)
      .join("");
  }
}

document.getElementById("clearNotifications")?.addEventListener("click", () => {
  state.notifications = [];
  const card = document.getElementById("notificationCard");
  if (card) card.innerHTML = "暂无通知";
});

function renderDesktop() {
  const desktop = document.getElementById("desktop");
  if (!desktop) return;

  desktop.innerHTML = "";

  const items = fs.children || [];

  items.forEach(item => {
    const node = document.createElement("div");
    node.className = "desktop-icon";
    node.dataset.nodeId = item.id;

    node.innerHTML = `
      <div class="icon">${item.type === "folder" ? "📁" : "📄"}</div>
      <div>${item.name}</div>
    `;

    node.addEventListener("dblclick", () => {
      if (item.type === "folder") {
        openApp("explorer", { nodeId: item.id });
      } else {
        openApp("notepad", { fileId: item.id });
      }
    });

    desktop.appendChild(node);
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
  const activeSet = new Set();

  document.querySelectorAll(".window.focused").forEach(win => {
    if (win.dataset.app) activeSet.add(win.dataset.app);
  });

  container.innerHTML = apps
    .map(appName => {
      const isActive = activeSet.has(appName);
      return `
        <button class="task-btn ${isActive ? "active" : ""}" data-task-app="${appName}" type="button">
          <span>${APPS[appName]?.icon || "🪟"}</span>
          <span class="title">${APPS[appName]?.title || appName}</span>
        </button>
      `;
    })
    .join("");
}

function bindGlobalEvents() {
  document.getElementById("startButton")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("startMenu");
    const noti = document.getElementById("notifications");
    if (menu) {
      const show = !menu.classList.contains("show");
      menu.classList.toggle("show", show);
      if (show) noti?.classList.remove("show");
    }
  });

  document.getElementById("allAppsBtn")?.addEventListener("click", () => {
    document.getElementById("startMenu")?.classList.add("show");
  });

  document.getElementById("quickButton")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const noti = document.getElementById("notifications");
    const menu = document.getElementById("startMenu");
    if (noti) {
      const show = !noti.classList.contains("show");
      noti.classList.toggle("show", show);
      if (show) menu?.classList.remove("show");
    }
  });

  document.getElementById("taskSearchInput")?.addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll(".app-card").forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(q) ? "flex" : "none";
    });
  });

  document.getElementById("startSearch")?.addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll(".app-card").forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(q) ? "flex" : "none";
    });
  });

  document.addEventListener("click", (event) => {
    const launchBtn = event.target.closest("[data-launch]");
    if (launchBtn) {
      const appName = launchBtn.dataset.launch;
      openApp(appName);
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

    const win = event.target.closest(".window");
    if (win) {
      focusWindow(win);
    }

    const actionBtn = event.target.closest("[data-context-action]");
    if (actionBtn) {
      handleContextAction(actionBtn.dataset.contextAction, actionBtn.dataset.nodeId);
      return;
    }

    if (!event.target.closest(".context-menu") && !event.target.closest(".desktop-icon")) {
      document.getElementById("contextMenu")?.classList.remove("show");
    }

    if (!event.target.closest("#startButton") && !event.target.closest("#startMenu")) {
      document.getElementById("startMenu")?.classList.remove("show");
    }

    if (!event.target.closest("#quickButton") && !event.target.closest("#notifications")) {
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

    const nodeEl = event.target.closest("[data-node-id]");
    if (nodeEl) {
      event.preventDefault();
      showNodeContextMenu(nodeEl.dataset.nodeId, event.clientX, event.clientY);
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
  });

  document.addEventListener("pointerup", () => {
    state.dragState = null;
  });
}

function showDesktopContextMenu(x, y) {
  const menu = document.getElementById("contextMenu");
  if (!menu) return;

  const hasClipboard = state.clipboard.mode !== "none" && state.clipboard.nodeId;

  menu.innerHTML = `
    <button type="button" data-context-action="new-folder">新建文件夹</button>
    <button type="button" data-context-action="new-file">新建文件</button>
    ${hasClipboard ? `<button type="button" data-context-action="paste" data-node-id="${fs.id}">粘贴</button>` : ""}
    <div class="separator"></div>
    <button type="button" data-context-action="refresh">刷新</button>
  `;

  menu.classList.add("show");
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

function showNodeContextMenu(nodeId, x, y) {
  const menu = document.getElementById("contextMenu");
  if (!menu) return;

  const node = findNode(nodeId);
  const hasClipboard = state.clipboard.mode !== "none" && state.clipboard.nodeId;

  menu.innerHTML = `
    <button type="button" data-context-action="open-node" data-node-id="${nodeId}">
      ${node?.type === "folder" ? "打开" : "打开文件"}
    </button>
    <button type="button" data-context-action="rename" data-node-id="${nodeId}">重命名</button>
    <button type="button" data-context-action="copy" data-node-id="${nodeId}">复制</button>
    <button type="button" data-context-action="cut" data-node-id="${nodeId}">剪切</button>
    <button type="button" data-context-action="delete" data-node-id="${nodeId}">删除</button>
    ${hasClipboard ? `<button type="button" data-context-action="paste" data-node-id="${nodeId}">粘贴到这里</button>` : ""}
    <div class="separator"></div>
    <button type="button" data-context-action="refresh">刷新</button>
  `;

  menu.classList.add("show");
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

function handleContextAction(action, nodeId) {
  const menu = document.getElementById("contextMenu");
  menu?.classList.remove("show");

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

      if (renameNode(nodeId, newName)) {
        renderDesktop();
        renderTaskbar();
        notify("已重命名");
      }
      break;
    }

    case "copy": {
      if (!nodeId) break;
      if (!findNode(nodeId)) break;

      state.clipboard = {
        mode: "copy",
        nodeId
      };
      notify("已复制");
      break;
    }

    case "cut": {
      if (!nodeId) break;
      if (!findNode(nodeId)) break;

      state.clipboard = {
        mode: "cut",
        nodeId
      };
      notify("已剪切");
      break;
    }

    case "paste": {
      const targetFolderId = nodeId || fs.id;
      const targetFolder = findNode(targetFolderId);

      if (!targetFolder || targetFolder.type !== "folder") break;
      if (!state.clipboard.nodeId) break;

      const sourceNode = findNode(state.clipboard.nodeId);
      if (!sourceNode) break;

      if (state.clipboard.mode === "copy") {
        const ok = pasteNodeIntoFolder(state.clipboard.nodeId, targetFolderId);
        if (ok) {
          renderDesktop();
          notify("已粘贴");
        }
      } else if (state.clipboard.mode === "cut") {
        const ok = moveNode(state.clipboard.nodeId, targetFolderId);
        if (ok) {
          renderDesktop();
          notify("已移动");
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
        notify("已删除");
      }
      break;
    }

    default:
      break;
  }
}

function focusWindow(win) {
  const all = document.querySelectorAll(".window");
  all.forEach(el => el.classList.remove("focused"));
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

  const icon = APPS[appName]?.icon || "🪟";
  const title = APPS[appName]?.title || "应用";

  const total = state.windows.size;
  win.style.left = `${120 + total * 36}px`;
  win.style.top = `${70 + total * 22}px`;

  win.innerHTML = `
    <header class="titlebar">
      <div class="window-title">
        <span>${icon}</span>
        <span>${title}</span>
      </div>
      <div class="window-controls">
        <button type="button" data-window-control="minimize" title="最小化">—</button>
        <button type="button" data-window-control="maximize" title="最大化">□</button>
        <button type="button" class="close" data-window-control="close" title="关闭">✕</button>
      </div>
    </header>
    <div class="window-content"></div>
  `;

  document.body.appendChild(win);

  win.querySelectorAll("[data-window-control]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      const action = btn.dataset.windowControl;
      const appName = win.dataset.app;

      if (action === "close") {
        win.remove();
        state.windows.delete(appName);
        renderTaskbar();
        return;
      }

      if (action === "minimize") {
        win.classList.add("minimized");
        renderTaskbar();
        return;
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

  if (appName === "calculator") {
    content.querySelectorAll(".calc-key").forEach(btn => {
      btn.addEventListener("click", () => {
        const display = content.querySelector(".calc-display");
        if (!display) return;

        const value = btn.textContent.trim();

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

        const existing = display.dataset.expr || "0";
        const next = existing === "0" ? value : existing + value;
        display.dataset.expr = next;
        display.value = next;
      });
    });
  }

  if (appName === "paint") {
    const canvas = content.querySelector("canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let drawing = false;
    let lastX = 0;
    let lastY = 0;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;

      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(ratio, ratio);
    };

    resizeCanvas();

    canvas.addEventListener("pointerdown", (e) => {
      drawing = true;
      const rect = canvas.getBoundingClientRect();
      lastX = e.clientX - rect.left;
      lastY = e.clientY - rect.top;
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!drawing) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const color = content.querySelector("[data-color]")?.value || "#1a73e8";
      const size = Number(content.querySelector("[data-size]")?.value || 5);

      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = "round";
      ctx.stroke();

      lastX = x;
      lastY = y;
    });

    canvas.addEventListener("pointerup", () => { drawing = false; });
    canvas.addEventListener("pointerleave", () => { drawing = false; });

    content.querySelector("[data-clear]")?.addEventListener("click", () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
  }

  if (appName === "terminal") {
    const input = content.querySelector(".terminal-input");
    const output = content.querySelector(".terminal-output");
    if (!input || !output) return;

    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;

      const cmd = input.value.trim();
      if (!cmd) return;

      const row = document.createElement("div");
      row.className = "terminal-row";
      row.innerHTML = `<span class="terminal-prompt">C:\\Users\\User&gt;</span><span>${cmd}</span>`;
      output.appendChild(row);

      const result = runTerminalCommand(cmd);
      if (result) {
        const res = document.createElement("div");
        res.textContent = result;
        output.appendChild(res);
      }

      input.value = "";
      output.scrollTop = output.scrollHeight;
    });
  }

  if (appName === "browser") {
    const iframe = content.querySelector(".browser-frame");
    const input = content.querySelector(".address");
    if (!iframe || !input) return;

    content.querySelectorAll("[data-browser]").forEach(btn => {
      btn.addEventListener("click", () => {
        const cmd = btn.dataset.browser;
        const url = input.value.trim();

        if (cmd === "go" && url) {
          iframe.src = url;
        }
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

function runTerminalCommand(cmd) {
  const lower = cmd.toLowerCase();

  if (lower === "help") {
    return "help  显示命令帮助\nver   显示版本\ndir   列出目录\nopen  打开应用\ncls   清屏\nshutdown  关闭终端";
  }

  if (lower === "ver") {
    return "Windows Web Terminal v1.0";
  }

  if (lower === "dir") {
    return fs.children.map(item => item.name).join("\n") || "空目录";
  }

  if (lower === "cls") {
    const terminal = document.querySelector(".terminal-output");
    if (terminal) terminal.innerHTML = "";
    return "";
  }

  if (lower === "open explorer") {
    openApp("explorer");
    return "已打开 资源管理器";
  }

  if (lower === "open browser") {
    openApp("browser");
    return "已打开 浏览器";
  }

  if (lower === "shutdown") {
    return "终端已关闭";
  }

  if (lower.startsWith("open ")) {
    const appKey = lower.replace("open ", "").trim();
    if (APPS[appKey]) {
      openApp(appKey);
      return `已打开 ${APPS[appKey].title}`;
    }
  }

  return `命令不存在: ${cmd}`;
}

function renderExplorer(nodeId) {
  const currentNode = findNode(nodeId) || fs;
  const parent = currentNode && currentNode.id !== fs.id ? findParent(currentNode.id) : null;
  const children = currentNode.children || [];

  const items = children
    .map(item => {
      const icon = item.type === "folder" ? "📁" : "📄";
      return `
        <div class="file-item" data-file-id="${item.id}" data-file-type="${item.type}" data-node-id="${item.id}">
          <span class="icon">${icon}</span>
          <span>${item.name}</span>
        </div>
      `;
    })
    .join("");

  return `
    <div class="explorer-layout">
      <aside class="sidebar">
        <div class="nav-item selected">📁 ${fs.name}</div>
        <div class="nav-item" data-go-root data-current="${currentNode.id}">🏠 根目录</div>
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
  const keys = ["C", "÷", "×", "-", "7", "8", "9", "+", "4", "5", "6", "=", "1", "2", "3", "0", "."];
  return `
    <div class="calc">
      <input class="calc-display" data-expr="0" value="0" readonly />
      <div class="calc-grid">
        ${keys.map(key => {
          const extra = ["÷", "×", "-", "+", "="].includes(key)
            ? (key === "=" ? "equal" : "operator")
            : "";
          return `<button type="button" class="calc-key ${extra}">${key}</button>`;
        }).join("")}
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
  for (let i = 0; i < 81; i++) {
    cells.push(`<button class="mine-cell" data-index="${i}" type="button"></button>`);
  }

  return `
    <div class="minesweeper">
      <div class="mine-status">
        <span>💣 扫雷</span>
        <span>剩余 10</span>
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
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const isToday = i === 12;
    cells.push(`<div class="calendar-day ${isToday ? "today" : ""}">${i + 1}</div>`);
  }

  return `
    <div class="calendar">
      <div class="calendar-head">
        <button type="button">‹</button>
        <strong>2026 年 11 月</strong>
        <button type="button">›</button>
      </div>
      <div class="calendar-grid">
        ${weeks.map(day => `<div class="calendar-weekday">${day}</div>`).join("")}
        ${cells.join("")}
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
        <p>支持：桌面图标、开始菜单、任务栏、窗口管理、资源管理器、浏览器、记事本、计算器和终端。</p>
        <p>技术栈：HTML + CSS + JavaScript</p>
      </div>
    </div>
  `;
}
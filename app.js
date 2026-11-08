const state = {
  windows: new Map(),
  zIndex: 100,
  notifications: []
};

document.addEventListener("DOMContentLoaded", () => {
  renderDesktop();
  renderAppGrid();
  renderTaskbar();
  bindGlobalEvents();
  updateClock();
  setInterval(updateClock, 1000);
  openApp("explorer");
});

function notify(msg) {
  const toast = document.getElementById("toast");
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

  container.innerHTML = Object.entries(APPS).map(([key, app]) => `
    <button class="app-card" data-launch="${key}">
      <span class="icon">${app.icon}</span>
      <span class="name">${app.title}</span>
    </button>
  `).join("");
}

function renderTaskbar() {
  const container = document.getElementById("taskButtons");
  if (!container) return;

  const apps = [...state.windows.keys()];

  container.innerHTML = apps.map(appName => `
    <button class="task-btn ${document.querySelector(`.window[data-app="${appName}"]`)?.classList.contains("focused") ? "active" : ""}" data-task-app="${appName}">
      <span>${APPS[appName].icon}</span>
      <span class="title">${APPS[appName].title}</span>
    </button>
  `).join("");
}

function bindGlobalEvents() {
  document.getElementById("startButton")?.addEventListener("click", () => {
    const menu = document.getElementById("startMenu");
    menu.classList.toggle("show");
  });

  document.getElementById("allAppsBtn")?.addEventListener("click", () => {
    const menu = document.getElementById("startMenu");
    menu.classList.add("show");
  });

  document.getElementById("quickButton")?.addEventListener("click", () => {
    const notifications = document.getElementById("notifications");
    notifications.classList.toggle("show");
  });

  document.getElementById("taskSearchInput")?.addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const cards = document.querySelectorAll(".app-card");
    cards.forEach(card => {
      const name = card.textContent.toLowerCase();
      card.style.display = name.includes(q) ? "flex" : "none";
    });
  });

  document.getElementById("startSearch")?.addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const cards = document.querySelectorAll(".app-card");
    cards.forEach(card => {
      const name = card.textContent.toLowerCase();
      card.style.display = name.includes(q) ? "flex" : "none";
    });
  });

  document.addEventListener("click", (event) => {
    const launchBtn = event.target.closest("[data-launch]");
    if (launchBtn) {
      const appName = launchBtn.dataset.launch;
      openApp(appName);
      const menu = document.getElementById("startMenu");
      menu.classList.remove("show");
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

    const mainWin = event.target.closest(".window");
    if (mainWin) {
      focusWindow(mainWin);
    }

    if (!event.target.closest(".context-menu") && !event.target.closest(".desktop-icon")) {
      document.getElementById("contextMenu")?.classList.remove("show");
    }
  });

  document.addEventListener("contextmenu", (event) => {
    const isDesktop = event.target.closest("#desktop");
    if (!isDesktop) return;

    event.preventDefault();

    const menu = document.getElementById("contextMenu");
    menu.innerHTML = `
      <button data-context="new-folder">新建文件夹</button>
      <button data-context="new-file">新建文件</button>
      <div class="separator"></div>
      <button data-context="refresh">刷新</button>
    `;
    menu.classList.add("show");
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
  });

  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-context]");
    if (!action) return;

    const ctx = action.dataset.context;
    if (ctx === "refresh") {
      renderDesktop();
      notify("已刷新桌面");
    }
    if (ctx === "new-folder") {
      const name = prompt("请输入文件夹名称", "新建文件夹");
      if (!name || !name.trim()) return;
      createNode(fs.id, "folder", name.trim());
      renderDesktop();
      notify("已创建文件夹");
    }
    if (ctx === "new-file") {
      const name = prompt("请输入文件名", "新建文件.txt");
      if (!name || !name.trim()) return;
      createNode(fs.id, "file", name.trim());
      renderDesktop();
      notify("已创建文件");
    }

    document.getElementById("contextMenu").classList.remove("show");
  });

  const closeButtons = document.querySelectorAll("[data-window]");
  closeButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const win = e.target.closest(".window");
      if (!win) return;
      const action = btn.dataset.window;

      if (action === "close") {
        const appName = win.dataset.app;
        win.remove();
        state.windows.delete(appName);
        renderTaskbar();
      }

      if (action === "minimize") {
        win.classList.add("minimized");
      }

      if (action === "maximize") {
        win.classList.toggle("maximized");
      }
    });
  });

  document.addEventListener("dblclick", (event) => {
    const item = event.target.closest(".desktop-icon");
    if (!item) return;
    const nodeId = item.dataset.nodeId;
    const node = findNode(nodeId);
    if (node?.type === "folder") openApp("explorer", { nodeId });
  });
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

  win.innerHTML = `
    <header class="titlebar">
      <div class="window-title">
        <span>${icon}</span>
        <span>${title}</span>
      </div>
      <div class="window-controls">
        <button data-window="minimize" title="最小化">—</button>
        <button data-window="maximize" title="最大化">□</button>
        <button class="close" data-window="close" title="关闭">✕</button>
      </div>
    </header>
    <div class="window-content"></div>
  `;

  document.body.appendChild(win);
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

  if (appName === "calculator") {
    content.querySelectorAll(".calc-key").forEach(btn => {
      btn.addEventListener("click", () => {
        const display = content.querySelector(".calc-display");
        const value = btn.textContent.trim();

        if (value === "C") {
          display.value = "0";
          return;
        }

        if (value === "=") {
          try {
            const expr = display.value.replace(/×/g, "*").replace(/÷/g, "/");
            display.value = Number(eval(expr)).toString();
          } catch {
            display.value = "Error";
          }
          return;
        }

        if (display.value === "0" || display.value === "Error") {
          display.value = value === "." ? "0." : value;
        } else {
          display.value += value;
        }
      });
    });
  }

  if (appName === "paint") {
    const canvas = content.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    let drawing = false;
    let lastX = 0;
    let lastY = 0;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
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

      const color = content.querySelector("[data-color]").value;
      const size = Number(content.querySelector("[data-size]").value);

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

    canvas.addEventListener("pointerup", () => drawing = false);
    canvas.addEventListener("pointerleave", () => drawing = false);

    content.querySelector("[data-clear]").addEventListener("click", () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
  }

  if (appName === "terminal") {
    const input = content.querySelector(".terminal-input");
    const output = content.querySelector(".terminal-output");

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

  return `命令不存在: ${cmd}`;
}

function renderExplorer(nodeId) {
  const currentNode = findNode(nodeId) || fs;
  const children = currentNode.children || [];

  const items = children.map(item => {
    const icon = item.type === "folder" ? "📁" : "📄";
    return `
      <div class="file-item" data-file-id="${item.id}" data-file-type="${item.type}">
        <span class="icon">${icon}</span>
        <span>${item.name}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="explorer-layout">
      <aside class="sidebar">
        <div class="nav-item selected">📁 桌面</div>
        <div class="nav-item">📄 文档</div>
        <div class="nav-item">📥 下载</div>
        <div class="nav-item">🖼️ 图片</div>
        <div class="nav-item">🗑️ 回收站</div>
      </aside>
      <div class="files-area">
        <h2>${currentNode.name}</h2>
        <div class="file-grid">${items || '<div style="padding:10px;color:#666;">暂无内容</div>'}</div>
      </div>
    </div>
  `;
}

function renderBrowser() {
  return `
    <div class="browser-wrap">
      <div class="browser-toolbar">
        <button data-browser="back">←</button>
        <button data-browser="forward">→</button>
        <button data-browser="home">⌂</button>
        <input class="address" value="https://www.bing.com/" />
        <button data-browser="go">Go</button>
      </div>
      <div class="browser-bookmarks">
        ${BOOKMARKS.map(item => `
          <button class="bm-card" data-url="${item.url}">
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
  const file = findNode(fileId) || { name: "新建记事本.txt", content: "" };
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
  const width = 900;
  const height = 520;
  return `
    <div class="paint-wrap">
      <div class="paint-toolbar">
        <input type="color" data-color value="#1a73e8" />
        <input type="range" data-size min="1" max="20" value="5" />
        <button data-clear>清空</button>
      </div>
      <canvas class="paint-canvas" width="${width}" height="${height}"></canvas>
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
  const size = 9;
  const cells = [];
  for (let i = 0; i < size * size; i++) {
    cells.push(`<button class="mine-cell" data-index="${i}"></button>`);
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
          <button>深色模式</button>
        </div>
        <div class="setting-card">
          <h3>系统</h3>
          <p>管理应用、存储空间与通知设置。</p>
          <button>打开设置</button>
        </div>
        <div class="setting-card">
          <h3>更新</h3>
          <p>检查系统更新并安装最新补丁。</p>
          <button>检查更新</button>
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
        <h2>Windows Web</h2>
        <p>这是一个简化版的 Windows 风格网页桌面，旨在展示桌面应用和窗口系统的交互模型。</p>
        <p>支持：桌面图标、开始菜单、任务栏、窗口管理、资源管理器、浏览器、记事本、计算器和终端。</p>
        <p>技术栈：HTML + CSS + JavaScript</p>
      </div>
    </div>
  `;
}
// ── Appearance (theme + accent) ───────────────────────────────
const html = document.documentElement;

function initAppearance() {
  const theme  = localStorage.getItem("tb-theme")  || "dark";
  const accent = localStorage.getItem("tb-accent") || "blue";
  applyTheme(theme);
  applyAccent(accent);
}
function applyTheme(theme) {
  html.setAttribute("data-theme", theme);
  localStorage.setItem("tb-theme", theme);
  document.querySelectorAll(".sp-theme-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.t === theme));
}
function applyAccent(accent) {
  html.setAttribute("data-accent", accent);
  localStorage.setItem("tb-accent", accent);
  document.querySelectorAll(".sp-swatch").forEach(b =>
    b.classList.toggle("active", b.dataset.a === accent));
}
function toggleStylePanel() {
  const panel = document.getElementById("style-panel");
  panel.classList.toggle("hidden");
}

// Init immediately so there's no flash of wrong theme
initAppearance();

// ── Config ──────────────────────────────────────────────────
const SUPABASE_URL      = "https://wgfdozmroijxubuiifjg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnZmRvem1yb2lqeHVidWlpZmpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzIxODgsImV4cCI6MjA5NjE0ODE4OH0.2HFVufskP_O8YvYJiUdxT6cooi0YC21lFxvt4-qpIP4";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ────────────────────────────────────────────────────
const S = {
  user: null,
  folders: [], projects: [], tasks: [], labels: [], comments: [],
  taskLabels: {},
  activeFolderId:  null,
  activeProjectId: null,
  activeTaskId:    null,
  filterLabels:    new Set(),
  pendingDelete:   null,
  // new-task modal selected labels
  modalLabels:     new Set(),
};

const g = id => document.getElementById(id);
function setLoading(btn, on) { btn.classList.toggle("loading", on); btn.disabled = on; }

const DEFAULT_PROJECT_COLOR = "#4d8dff";
const WORKFLOW_LABELS = {
  backlog: "Backlog",
  next: "Next",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};
const clampProgress = value => Math.max(0, Math.min(100, Number(value) || 0));
const taskProgress = task => clampProgress(task.progress ?? (task.done ? 100 : 0));
const taskWorkflow = task => task.workflow || (task.done ? "done" : "backlog");
const projectColor = project => /^#[0-9a-f]{6}$/i.test(project?.color || "") ? project.color : DEFAULT_PROJECT_COLOR;
const missingDbFeature = error => /schema cache|column|relation|table|does not exist|Could not find/i.test(error?.message || "");
function projectProgress(projectId) {
  const tasks = S.tasks.filter(t => t.project_id === projectId);
  if (!tasks.length) return 0;
  return Math.round(tasks.reduce((sum, task) => sum + taskProgress(task), 0) / tasks.length);
}

// ── Notification toast (replaces all alert() calls) ───────────
let _notifTimer;
const ICONS = {
  error:   `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v4M8 11v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  warn:    `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L14.5 13.5H1.5L8 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6v4M8 11.5v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  success: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M5 8l2.5 2.5L11 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
function showNotif(msg, type = "error") {
  clearTimeout(_notifTimer);
  const toast = g("notif-toast");
  g("notif-icon").innerHTML = ICONS[type] || ICONS.error;
  g("notif-msg").textContent = msg;
  toast.className = `notif-toast notif-${type}`;
  // re-trigger animation
  void toast.offsetWidth;
  _notifTimer = setTimeout(() => toast.classList.add("hidden"), 6000);
}
document.addEventListener("DOMContentLoaded", () => {
  g("notif-close").onclick = () => {
    clearTimeout(_notifTimer);
    g("notif-toast").classList.add("hidden");
  };
  document.querySelectorAll(".password-toggle").forEach(btn => {
    const input = g(btn.dataset.target);
    btn.onclick = () => {
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.classList.toggle("showing", !showing);
      btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      btn.setAttribute("aria-pressed", String(!showing));
      input.focus();
    };
  });
});

// ── Due date helpers ─────────────────────────────────────────
function dueBadge(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(dateStr + "T00:00:00");
  const diff  = Math.round((due - today) / 86400000);
  const label = diff === 0 ? "Today"
              : diff === 1 ? "Tomorrow"
              : diff < 0   ? `${Math.abs(diff)}d overdue`
              : due.toLocaleDateString("en-US", { month:"short", day:"numeric" });
  const cls   = diff < 0 ? "overdue" : diff === 0 ? "today" : diff <= 3 ? "soon" : "";
  const span  = document.createElement("span");
  span.className = "due-badge" + (cls ? " " + cls : "");
  span.innerHTML = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 1v2M8.5 1v2M1 5h10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg> ${label}`;
  return span;
}

// ── Auth ─────────────────────────────────────────────────────
function showPanel(id) {
  document.querySelectorAll(".auth-panel").forEach(p => p.classList.remove("active"));
  g(id).classList.add("active");
}
// ── Appearance button wiring ──────────────────────────────────
document.getElementById("btn-appearance").onclick = (e) => {
  e.stopPropagation();
  toggleStylePanel();
};
document.querySelectorAll(".sp-theme-btn").forEach(btn =>
  btn.addEventListener("click", () => applyTheme(btn.dataset.t)));
document.querySelectorAll(".sp-swatch").forEach(btn =>
  btn.addEventListener("click", () => applyAccent(btn.dataset.a)));
// Close panel when clicking outside
// Use trigger.contains() so clicks on the SVG *inside* the button don't count as "outside"
document.addEventListener("click", (e) => {
  const panel = document.getElementById("style-panel");
  const trigger = document.getElementById("btn-appearance");
  if (!panel.classList.contains("hidden") &&
      !panel.contains(e.target) && !trigger.contains(e.target)) {
    panel.classList.add("hidden");
  }
});

g("goto-signup").onclick   = () => showPanel("auth-signup");
g("goto-signin").onclick   = () => showPanel("auth-signin");
g("goto-signin-2").onclick = () => showPanel("auth-signin");
g("btn-signin").onclick    = () => doAuth("signin");
g("btn-signup").onclick    = () => doAuth("signup");
["si-email","si-password"].forEach(id => g(id).addEventListener("keydown", e => e.key === "Enter" && doAuth("signin")));
["su-email","su-password"].forEach(id => g(id).addEventListener("keydown", e => e.key === "Enter" && doAuth("signup")));

async function doAuth(mode) {
  const isSignup = mode === "signup";
  const email    = g(isSignup ? "su-email"    : "si-email").value.trim();
  const password = g(isSignup ? "su-password" : "si-password").value;
  const msgEl    = g(isSignup ? "su-msg"      : "si-msg");
  const btn      = g(isSignup ? "btn-signup"  : "btn-signin");
  msgEl.textContent = ""; msgEl.className = "auth-msg";
  if (!email || !password) { msgEl.textContent = "Please fill in both fields."; return; }
  setLoading(btn, true);
  const { error } = isSignup
    ? await db.auth.signUp({ email, password })
    : await db.auth.signInWithPassword({ email, password });
  setLoading(btn, false);
  if (error) { msgEl.textContent = error.message; return; }
  if (isSignup) showPanel("auth-confirm");
}

g("btn-signout").onclick         = () => db.auth.signOut();
g("btn-signout-sidebar").onclick = () => db.auth.signOut();

db.auth.onAuthStateChange((_e, session) => {
  if (session?.user) {
    S.user = session.user;
    // Populate sidebar user area
    const email = session.user.email || "";
    const initial = (email[0] || "U").toUpperCase();
    g("user-avatar").textContent = initial;
    g("user-email").textContent  = email;
    g("auth-overlay").classList.add("hidden");
    g("app").classList.remove("hidden");
    loadAll();
  } else {
    S.user = null;
    g("auth-overlay").classList.remove("hidden");
    g("app").classList.add("hidden");
  }
});

// ── Data loading ──────────────────────────────────────────────
async function loadAll() {
  const [fr, pr, tr, lr, tlr, cr] = await Promise.all([
    db.from("folders").select("*").order("created_at"),
    db.from("projects").select("*").order("created_at"),
    db.from("tasks").select("*").order("created_at"),
    db.from("labels").select("*").order("created_at"),
    db.from("task_labels").select("*"),
    db.from("task_comments").select("*").order("created_at"),
  ]);
  // ④ Check ALL responses — previously only fr.error was checked
  if (cr.error && missingDbFeature(cr.error)) {
    console.warn("Task comments unavailable until schema.sql is applied:", cr.error);
    showNotif("Comments unavailable — run the updated schema.sql in Supabase.", "warn");
    cr.data = [];
    cr.error = null;
  }
  const firstErr = [fr, pr, tr, lr, tlr, cr].find(r => r.error);
  if (firstErr) { console.error("Load error:", firstErr.error); showNotif("Failed to load data: " + firstErr.error.message); return; }
  S.folders  = fr.data  || [];
  S.projects = pr.data  || [];
  S.tasks    = tr.data  || [];
  S.labels   = lr.data  || [];
  S.comments = cr.data || [];
  S.taskLabels = {};
  (tlr.data || []).forEach(({ task_id, label_id }) => { (S.taskLabels[task_id] ||= []).push(label_id); });
  if (!S.activeFolderId && S.folders[0]) S.activeFolderId = S.folders[0].id;
  renderAll();
}

// ── Render ────────────────────────────────────────────────────
function renderAll() { renderFolders(); renderProjects(); renderTasks(); }

function emptyState(icon, title, hint) {
  return `<div class="empty-state">
    <div class="empty-icon">${icon}</div>
    <strong>${title}</strong>
    <span>${hint}</span>
  </div>`;
}

function renderFolders() {
  const ul = g("folder-list"); ul.innerHTML = "";
  if (!S.folders.length) {
    ul.innerHTML = emptyState(
      `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 5.5A1.5 1.5 0 013.5 4h4l2 2h7A1.5 1.5 0 0118 7.5v8A1.5 1.5 0 0116.5 17h-13A1.5 1.5 0 012 15.5v-10z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
      "No folders yet", "Click + to create your first folder"
    );
    return;
  }
  S.folders.forEach(f => {
    const count = S.projects.filter(p => p.folder_id === f.id).length;
    ul.appendChild(buildRowItem(f, count, f.id === S.activeFolderId, {
      onClick:  () => { S.activeFolderId = f.id; S.activeProjectId = null; renderAll(); if (mobile()) openMobilePane("projects"); },
      onDelete: () => confirmDelete(`Delete folder "${f.name}" and everything inside?`, () => deleteFolder(f)),
    }));
  });
}

function renderProjects() {
  const ul = g("project-list"); ul.innerHTML = "";
  const folder = S.folders.find(f => f.id === S.activeFolderId);
  g("projects-label").textContent = folder ? folder.name : "Projects";
  g("btn-add-project").disabled = !folder;
  if (!folder) { ul.innerHTML = emptyState(`<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4l6 4v8H4V8l6-4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`, "Pick a folder", "Select a folder on the left"); return; }
  const items = S.projects.filter(p => p.folder_id === folder.id);
  if (!items.length) { ul.innerHTML = emptyState(`<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="5" width="14" height="11" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M7 5V4a1 1 0 011-1h4a1 1 0 011 1v1" stroke="currentColor" stroke-width="1.4"/></svg>`, "No projects yet", "Click + to create one"); return; }
  items.forEach(p => {
    const count = S.tasks.filter(t => t.project_id === p.id).length;
    ul.appendChild(buildRowItem(p, count, p.id === S.activeProjectId, {
      onClick:  () => { S.activeProjectId = p.id; renderAll(); if (mobile()) openMobilePane("tasks"); },
      onDelete: () => confirmDelete(`Delete project "${p.name}" and all its tasks?`, () => deleteProject(p)),
    }, true));
  });
}

function updateBreadcrumb() {
  const folder  = S.folders.find(f => f.id === S.activeFolderId);
  const project = S.projects.find(p => p.id === S.activeProjectId);
  const folderEl  = g("crumb-folder");
  const projectEl = g("crumb-project");
  const sep = g("crumb-sep");
  if (folder && project) {
    folderEl.textContent = folder.name;
    projectEl.textContent = project.name;
    sep.classList.remove("hidden");
  } else if (folder) {
    folderEl.textContent = folder.name;
    projectEl.textContent = "";
    sep.classList.add("hidden");
  } else {
    folderEl.textContent = "Tasks";
    projectEl.textContent = "";
    sep.classList.add("hidden");
  }
}

function renderTasks() {
  const ul = g("task-list"); ul.innerHTML = "";
  const project = S.projects.find(p => p.id === S.activeProjectId);
  g("tasks-label").textContent = project ? project.name : "Tasks";
  g("btn-add-task").disabled = !project;
  updateBreadcrumb();
  const styleBar = g("project-style-bar");
  if (project) {
    const pct = projectProgress(project.id);
    styleBar.classList.remove("hidden");
    styleBar.style.setProperty("--project-color", projectColor(project));
    g("project-color-input").value = projectColor(project);
    g("project-progress-percent").textContent = pct + "%";
    g("tasks-pane").style.setProperty("--project-color", projectColor(project));
  } else {
    styleBar.classList.add("hidden");
    g("tasks-pane").style.removeProperty("--project-color");
  }

  // label filter bar
  const bar = g("label-filter-bar"), chips = g("label-chips");
  chips.innerHTML = "";
  if (S.labels.length) {
    bar.classList.remove("hidden");
    S.labels.forEach(l => {
      const on = S.filterLabels.has(l.id);
      chips.appendChild(mkChip(l.name, on, () => { on ? S.filterLabels.delete(l.id) : S.filterLabels.add(l.id); renderTasks(); }));
    });
  } else { bar.classList.add("hidden"); }

  if (!project) {
    g("tasks-overview").classList.add("hidden");
    ul.innerHTML = emptyState(`<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 10h10M5 6h10M5 14h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`, "Pick a project", "Select a project to see its tasks");
    return;
  }

  let items = S.tasks.filter(t => t.project_id === project.id);
  if (S.filterLabels.size) items = items.filter(t => [...S.filterLabels].every(id => (S.taskLabels[t.id]||[]).includes(id)));

  // ── Overview stats (Mapbox usage bar) ──
  const allInProject = S.tasks.filter(t => t.project_id === project.id);
  const total   = allInProject.length;
  const done    = allInProject.filter(t => t.done).length;
  const today   = new Date(); today.setHours(0,0,0,0);
  const overdue = allInProject.filter(t => !t.done && t.due_date && new Date(t.due_date + "T00:00:00") < today).length;
  const ov = g("tasks-overview");
  if (total > 0) {
    g("ov-total").textContent   = total;
    g("ov-done").textContent    = done;
    g("ov-overdue").textContent = overdue;
    g("ov-fill").style.width    = projectProgress(project.id) + "%";
    ov.classList.remove("hidden");
  } else { ov.classList.add("hidden"); }

  if (!items.length) { ul.innerHTML = emptyState(`<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="4" y="4" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M8 10l2 2 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`, "No tasks yet", "Click + to add your first task"); return; }

  items.forEach(t => {
    const li = document.createElement("li");
    li.className = "task-row" + (t.done ? " done" : "");
    li.style.setProperty("--project-color", projectColor(project));
    li.onclick = () => openDrawer(t.id);

    const top = document.createElement("div");
    top.className = "task-top";
    const chk = document.createElement("button");
    chk.className = "check-btn" + (t.done ? " checked" : "");
    chk.setAttribute("aria-label", "Toggle done");
    chk.onclick = e => { e.stopPropagation(); toggleDone(t); };
    const name = document.createElement("span");
    name.className = "task-name";
    name.textContent = t.title;
    top.appendChild(chk); top.appendChild(name);
    li.appendChild(top);

    const progressRow = document.createElement("div");
    progressRow.className = "task-progress-row";
    const workflow = document.createElement("span");
    workflow.className = "workflow-chip workflow-" + taskWorkflow(t);
    workflow.textContent = WORKFLOW_LABELS[taskWorkflow(t)] || "Backlog";
    const pctText = document.createElement("span");
    pctText.className = "task-percent";
    pctText.textContent = taskProgress(t) + "%";
    const track = document.createElement("div");
    track.className = "task-progress-track";
    const fill = document.createElement("div");
    fill.className = "task-progress-fill";
    fill.style.width = taskProgress(t) + "%";
    track.appendChild(fill);
    progressRow.appendChild(workflow);
    progressRow.appendChild(track);
    progressRow.appendChild(pctText);
    li.appendChild(progressRow);

    // bottom row: chips + due date
    const lIds = S.taskLabels[t.id] || [];
    const commentCount = S.comments.filter(c => c.task_id === t.id).length;
    const hasMeta = lIds.length || t.due_date || commentCount;
    if (hasMeta) {
      const row = document.createElement("div");
      row.className = "task-chips";
      lIds.forEach(id => { const l = S.labels.find(x => x.id === id); if (l) row.appendChild(mkChip(l.name, false, null)); });
      const badge = dueBadge(t.due_date);
      if (badge) row.appendChild(badge);
      if (commentCount) {
        const comments = document.createElement("span");
        comments.className = "due-badge comment-badge";
        comments.textContent = `${commentCount} comment${commentCount === 1 ? "" : "s"}`;
        row.appendChild(comments);
      }
      li.appendChild(row);
    }
    ul.appendChild(li);
  });
}

// ── Row item builder ──────────────────────────────────────────
// isProject=true adds a mini progress bar (Mapbox usage-bar style)
function buildRowItem(item, count, active, { onClick, onDelete }, isProject = false) {
  const li = document.createElement("li");
  li.className = "row-item" + (active ? " active" : "");
  if (isProject) li.style.setProperty("--project-color", projectColor(item));
  li.onclick = onClick;

  const name = document.createElement("span"); name.className = "row-name"; name.textContent = item.name;
  const swatch = document.createElement("span");
  swatch.className = "row-color-dot";
  swatch.setAttribute("aria-hidden", "true");
  if (isProject) swatch.style.background = projectColor(item);
  const colorPicker = document.createElement("input");
  colorPicker.className = "project-row-color-input";
  colorPicker.type = "color";
  colorPicker.value = projectColor(item);
  colorPicker.title = "Change project color";
  colorPicker.setAttribute("aria-label", `Change color for ${item.name}`);
  colorPicker.onclick = e => e.stopPropagation();
  colorPicker.oninput = e => {
    e.stopPropagation();
    item.color = e.target.value;
    li.style.setProperty("--project-color", item.color);
    swatch.style.background = item.color;
    if (S.activeProjectId === item.id) {
      g("tasks-pane").style.setProperty("--project-color", item.color);
      g("project-style-bar").style.setProperty("--project-color", item.color);
      g("project-color-input").value = item.color;
    }
  };
  colorPicker.onchange = e => {
    e.stopPropagation();
    saveProjectColor(item, e.target.value);
  };

  // For projects: show done/total ratio instead of plain count
  const cnt = document.createElement("span"); cnt.className = "row-count";
  if (isProject) {
    const projectTasks = S.tasks.filter(t => t.project_id === item.id);
    const doneCount = projectTasks.filter(t => t.done).length;
    cnt.textContent = count ? `${projectProgress(item.id)}%` : "0%";
    cnt.title = `${doneCount}/${count} tasks done`;
  } else {
    cnt.textContent = String(count);
  }

  const del  = document.createElement("button"); del.className = "row-del"; del.setAttribute("aria-label","Delete");
  del.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3h9M5 3V2a.5.5 0 01.5-.5h2A.5.5 0 018 2v1M10 3l-.7 7.5H3.7L3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  del.onclick = e => { e.stopPropagation(); onDelete(); };

  const conf = document.createElement("div"); conf.className = "row-del-confirm";
  const yes  = document.createElement("button"); yes.className = "del-yes"; yes.textContent = "Delete";
  yes.onclick = e => { e.stopPropagation(); li.classList.remove("confirming"); onDelete(); };
  const no   = document.createElement("button"); no.className  = "del-no";  no.textContent  = "Cancel";
  no.onclick  = e => { e.stopPropagation(); li.classList.remove("confirming"); };
  conf.appendChild(yes); conf.appendChild(no);

  if (isProject) li.appendChild(swatch);
  li.appendChild(name); li.appendChild(cnt); li.appendChild(del); li.appendChild(conf);
  if (isProject) li.appendChild(colorPicker);

  // Project progress bar (Mapbox-style usage bar)
  if (isProject && count > 0) {
    const projectTasks = S.tasks.filter(t => t.project_id === item.id);
    const doneCount = projectTasks.filter(t => t.done).length;
    const pct = projectProgress(item.id);
    const track = document.createElement("div"); track.className = "row-progress";
    const fill  = document.createElement("div"); fill.className  = "row-progress-fill";
    fill.style.width = pct + "%";
    track.appendChild(fill);
    // Insert progress bar as second line inside the li
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;flex:1;min-width:0;gap:5px;";
    wrap.appendChild(name);
    wrap.appendChild(track);
    li.insertBefore(wrap, cnt);
  }

  return li;
}

function mkChip(text, on, onClick) {
  const s = document.createElement("span");
  s.className = "chip" + (on ? " on" : "");
  s.textContent = text;
  if (onClick) s.onclick = onClick;
  return s;
}

// ── Inline add (folders / projects only) ─────────────────────
function openInlineAdd(listEl, placeholder, onSave) {
  closeInlineAdd();
  const li  = document.createElement("li"); li.id = "_inline_add"; li.className = "inline-add-row";
  const inp = document.createElement("input"); inp.type = "text"; inp.placeholder = placeholder; inp.maxLength = 80;
  const save   = document.createElement("button"); save.className = "inline-confirm"; save.textContent = "Add";
  const cancel = document.createElement("button"); cancel.className = "inline-x"; cancel.innerHTML = "×";
  li.appendChild(inp); li.appendChild(save); li.appendChild(cancel);
  listEl.appendChild(li);
  inp.focus();
  async function submit() {
    const val = inp.value.trim(); if (!val) { inp.focus(); return; }
    save.disabled = true; save.textContent = "…";
    await onSave(val); closeInlineAdd();
  }
  inp.addEventListener("keydown", e => { if (e.key === "Enter") submit(); if (e.key === "Escape") closeInlineAdd(); });
  save.onclick = submit; cancel.onclick = closeInlineAdd;
}
function closeInlineAdd() { const el = g("_inline_add"); if (el) el.remove(); }

// ── New Task Modal ────────────────────────────────────────────
g("btn-add-task").onclick    = openNewTaskModal;
g("btn-close-modal").onclick = closeNewTaskModal;
g("btn-modal-cancel").onclick = closeNewTaskModal;
g("new-task-modal").addEventListener("click", e => { if (e.target === g("new-task-modal")) closeNewTaskModal(); });
g("nt-title").addEventListener("keydown", e => { if (e.key === "Enter") saveNewTask(); if (e.key === "Escape") closeNewTaskModal(); });
g("btn-modal-save").onclick = saveNewTask;
g("nt-progress").addEventListener("input", () => {
  g("nt-progress-value").textContent = clampProgress(g("nt-progress").value) + "%";
});
g("nt-workflow").addEventListener("change", () => {
  if (g("nt-workflow").value === "done") {
    g("nt-progress").value = 100;
    g("nt-progress-value").textContent = "100%";
  }
});

// new label in modal
g("btn-nt-new-label").onclick = () => { g("nt-label-form").classList.remove("hidden"); g("nt-new-label-input").focus(); };
g("btn-nt-cancel-label").onclick = () => { g("nt-label-form").classList.add("hidden"); g("nt-new-label-input").value = ""; };
g("btn-nt-save-label").onclick = saveModalLabel;
g("nt-new-label-input").addEventListener("keydown", e => {
  if (e.key === "Enter") saveModalLabel();
  if (e.key === "Escape") { g("nt-label-form").classList.add("hidden"); g("nt-new-label-input").value = ""; }
});

function openNewTaskModal() {
  if (!S.activeProjectId) return;
  S.modalLabels.clear();
  g("nt-title").value = "";
  g("nt-due").value   = "";
  g("nt-workflow").value = "backlog";
  g("nt-progress").value = 0;
  g("nt-progress-value").textContent = "0%";
  g("nt-label-form").classList.add("hidden");
  g("nt-new-label-input").value = "";
  renderModalLabelChips();
  g("new-task-modal").classList.remove("hidden");
  setTimeout(() => g("nt-title").focus(), 50);
}
function closeNewTaskModal() {
  g("new-task-modal").classList.add("hidden");
}
function renderModalLabelChips() {
  const wrap = g("nt-label-chips"); wrap.innerHTML = "";
  if (!S.labels.length) {
    wrap.innerHTML = `<span style="color:var(--text-3);font-size:13px">No labels yet — click "+ New label" below.</span>`;
    return;
  }
  S.labels.forEach(l => {
    const on = S.modalLabels.has(l.id);
    const chip = mkChip(l.name, on, () => {
      on ? S.modalLabels.delete(l.id) : S.modalLabels.add(l.id);
      renderModalLabelChips();
    });
    wrap.appendChild(chip);
  });
}
async function saveModalLabel() {
  const name = g("nt-new-label-input").value.trim(); if (!name) return;
  const { data, error } = await db.from("labels").insert({ name, user_id: S.user.id }).select().single();
  if (error) return showNotif(error.message);
  S.labels.push(data);
  g("nt-label-form").classList.add("hidden");
  g("nt-new-label-input").value = "";
  renderModalLabelChips();
}
async function saveNewTask() {
  const title    = g("nt-title").value.trim();
  const due_date = g("nt-due").value || null;
  const workflow = g("nt-workflow").value || "backlog";
  const progress = workflow === "done" ? 100 : clampProgress(g("nt-progress").value);
  if (!title) { g("nt-title").focus(); g("nt-title").style.borderBottomColor = "var(--danger)"; return; }
  g("btn-modal-save").disabled = true; g("btn-modal-save").textContent = "Adding…";
  let payload = { title, due_date, workflow, progress, project_id: S.activeProjectId, user_id: S.user.id, done: workflow === "done" || progress === 100 };
  let { data, error } = await db.from("tasks").insert(payload).select().single();
  // Graceful fallback: if due_date column doesn't exist yet, retry without it
  if (error && error.message && error.message.includes("due_date")) {
    showNotif("Due dates unavailable — run the database migration to enable them.", "warn");
    const { due_date: _dd, ...payloadNoDue } = payload;
    ({ data, error } = await db.from("tasks").insert(payloadNoDue).select().single());
  }
  if (error && missingDbFeature(error)) {
    showNotif("Workflow/progress unavailable — run the updated schema.sql in Supabase.", "warn");
    const { workflow: _wf, progress: _pg, ...payloadBasic } = payload;
    ({ data, error } = await db.from("tasks").insert(payloadBasic).select().single());
  }
  if (error) { showNotif(error.message); g("btn-modal-save").disabled = false; g("btn-modal-save").textContent = "Add Task"; return; }
  S.tasks.push(data);
  // assign labels
  if (S.modalLabels.size) {
    const rows = [...S.modalLabels].map(lid => ({ task_id: data.id, label_id: lid, user_id: S.user.id }));
    await db.from("task_labels").insert(rows);
    S.taskLabels[data.id] = [...S.modalLabels];
  }
  g("btn-modal-save").disabled = false; g("btn-modal-save").textContent = "Add Task";
  closeNewTaskModal();
  renderTasks(); renderProjects();
}

// ── Mutations ─────────────────────────────────────────────────
g("btn-add-folder").onclick  = () => openInlineAdd(g("folder-list"),  "Folder name…",  addFolder);
g("btn-add-project").onclick = () => openInlineAdd(g("project-list"), "Project name…", addProject);

async function addFolder(name) {
  const { data, error } = await db.from("folders").insert({ name, user_id: S.user.id }).select().single();
  if (error) return showNotif(error.message);
  S.folders.push(data); S.activeFolderId = data.id; renderAll();
}
async function deleteFolder(f) {
  const { error } = await db.from("folders").delete().eq("id", f.id);
  if (error) return showNotif(error.message);
  S.folders  = S.folders.filter(x => x.id !== f.id);
  S.projects = S.projects.filter(p => p.folder_id !== f.id);
  if (S.activeFolderId === f.id) { S.activeFolderId = S.folders[0]?.id ?? null; S.activeProjectId = null; }
  renderAll();
}
async function addProject(name) {
  let { data, error } = await db.from("projects").insert({ name, folder_id: S.activeFolderId, user_id: S.user.id, color: DEFAULT_PROJECT_COLOR }).select().single();
  if (error && missingDbFeature(error)) {
    showNotif("Project colors unavailable — run the updated schema.sql in Supabase.", "warn");
    ({ data, error } = await db.from("projects").insert({ name, folder_id: S.activeFolderId, user_id: S.user.id }).select().single());
  }
  if (error) return showNotif(error.message);
  S.projects.push(data); S.activeProjectId = data.id; renderAll();
}
g("project-color-input").addEventListener("input", e => {
  const p = S.projects.find(x => x.id === S.activeProjectId); if (!p) return;
  p.color = e.target.value;
  renderProjects();
  renderTasks();
});
g("project-color-input").addEventListener("change", async e => {
  const p = S.projects.find(x => x.id === S.activeProjectId); if (!p) return;
  saveProjectColor(p, e.target.value);
});
async function saveProjectColor(project, color) {
  const { error } = await db.from("projects").update({ color }).eq("id", project.id);
  if (error) {
    if (missingDbFeature(error)) {
      showNotif("Project colors unavailable — run the updated schema.sql in Supabase.", "warn");
      return;
    }
    showNotif(error.message);
    return;
  }
  project.color = color;
  renderProjects();
  renderTasks();
}
async function deleteProject(p) {
  const { error } = await db.from("projects").delete().eq("id", p.id);
  if (error) return showNotif(error.message);
  S.projects = S.projects.filter(x => x.id !== p.id);
  S.tasks    = S.tasks.filter(t => t.project_id !== p.id);
  if (S.activeProjectId === p.id) S.activeProjectId = null;
  renderAll();
}
async function toggleDone(t) {
  const next = !t.done;
  const payload = next
    ? { done: true, workflow: "done", progress: 100 }
    : { done: false, workflow: t.workflow === "done" ? "in_progress" : taskWorkflow(t), progress: Math.min(taskProgress(t), 95) };
  let savedPayload = payload;
  let { error } = await db.from("tasks").update(payload).eq("id", t.id);
  if (error && missingDbFeature(error)) {
    showNotif("Workflow/progress unavailable — run the updated schema.sql in Supabase.", "warn");
    savedPayload = { done: next };
    ({ error } = await db.from("tasks").update({ done: next }).eq("id", t.id));
  }
  if (error) return showNotif(error.message);
  Object.assign(t, savedPayload);
  renderTasks(); renderProjects();
  if (S.activeTaskId === t.id) {
    g("btn-toggle-done").classList.toggle("done-active", t.done);
    g("toggle-done-label").textContent = t.done ? "Mark not done" : "Mark done";
    g("task-workflow-input").value = taskWorkflow(t);
    g("task-progress-input").value = taskProgress(t);
    g("task-progress-value").textContent = taskProgress(t) + "%";
  }
}
async function deleteTask() {
  const t = S.tasks.find(x => x.id === S.activeTaskId); if (!t) return;
  const { error } = await db.from("tasks").delete().eq("id", t.id);
  if (error) return showNotif(error.message);
  S.tasks = S.tasks.filter(x => x.id !== t.id);
  S.comments = S.comments.filter(c => c.task_id !== t.id);
  delete S.taskLabels[t.id];
  closeDrawer(); renderTasks(); renderProjects();
}

// ── Delete confirm toast ──────────────────────────────────────
// ③ Race-condition fix: dismiss any in-progress toast before showing a new one,
//    so rapid back-to-back calls never leave S.pendingDelete pointing at the wrong action.
function confirmDelete(msg, onConfirm) {
  // Cancel any pending delete that hasn't been confirmed yet
  S.pendingDelete = null;
  g("delete-toast").classList.add("hidden");
  // Small delay so the hide/show is visible if re-triggered immediately
  requestAnimationFrame(() => {
    g("delete-toast-msg").textContent = msg;
    S.pendingDelete = onConfirm;
    g("delete-toast").classList.remove("hidden");
  });
}
g("btn-delete-confirm").onclick = async () => {
  const cb = S.pendingDelete;
  S.pendingDelete = null;                     // clear before await — prevents double-fire
  g("delete-toast").classList.add("hidden");
  if (cb) await cb();
};
g("btn-delete-cancel").onclick = () => {
  S.pendingDelete = null;
  g("delete-toast").classList.add("hidden");
};

// ── Task drawer ───────────────────────────────────────────────
function openDrawer(id) {
  S.activeTaskId = id;
  const t = S.tasks.find(x => x.id === id); if (!t) return;
  g("task-title-input").value = t.title;
  g("task-notes-input").value = t.notes || "";
  g("task-due-input").value   = t.due_date || "";
  g("task-workflow-input").value = taskWorkflow(t);
  g("task-progress-input").value = taskProgress(t);
  g("task-progress-value").textContent = taskProgress(t) + "%";
  g("btn-toggle-done").classList.toggle("done-active", t.done);
  g("toggle-done-label").textContent = t.done ? "Mark not done" : "Mark done";
  g("add-label-form").classList.add("hidden");
  g("new-label-input").value = "";
  renderDrawerLabels();
  renderComments();
  g("drawer").classList.remove("hidden");
}
function closeDrawer() { S.activeTaskId = null; g("new-comment-input").value = ""; g("drawer").classList.add("hidden"); }

g("btn-close-drawer").onclick = closeDrawer;
g("drawer").addEventListener("click", e => { if (e.target === g("drawer")) closeDrawer(); });
g("btn-toggle-done").onclick  = () => { const t = S.tasks.find(x => x.id === S.activeTaskId); if (t) toggleDone(t); };
g("btn-delete-task").onclick  = () => confirmDelete("Delete this task?", deleteTask);

// auto-save title / notes / due date
let _saveTimer;
function schedSave() { clearTimeout(_saveTimer); _saveTimer = setTimeout(saveDrawerFields, 500); }
g("task-title-input").addEventListener("input",  schedSave);
g("task-notes-input").addEventListener("input",  schedSave);
g("task-due-input").addEventListener("change",   schedSave);
g("task-workflow-input").addEventListener("change", () => {
  if (g("task-workflow-input").value === "done") {
    g("task-progress-input").value = 100;
    g("task-progress-value").textContent = "100%";
  }
  schedSave();
});
g("task-progress-input").addEventListener("input", () => {
  g("task-progress-value").textContent = clampProgress(g("task-progress-input").value) + "%";
});
g("task-progress-input").addEventListener("change", schedSave);

async function saveDrawerFields() {
  const t = S.tasks.find(x => x.id === S.activeTaskId); if (!t) return;
  const title    = g("task-title-input").value.trim() || "Untitled";
  const notes    = g("task-notes-input").value;
  const due_date = g("task-due-input").value || null;
  const workflow = g("task-workflow-input").value || "backlog";
  const progress = workflow === "done" ? 100 : clampProgress(g("task-progress-input").value);
  const done = workflow === "done" || progress === 100;
  let payload = { title, notes, due_date, workflow, progress, done };
  let savedPayload = payload;
  let { error } = await db.from("tasks").update(payload).eq("id", t.id);
  // Graceful fallback: if due_date column doesn't exist yet, save without it
  if (error && error.message && error.message.includes("due_date")) {
    savedPayload = { title, notes };
    ({ error } = await db.from("tasks").update(savedPayload).eq("id", t.id));
  }
  if (error && missingDbFeature(error)) {
    showNotif("Workflow/progress unavailable — run the updated schema.sql in Supabase.", "warn");
    savedPayload = { title, notes, due_date };
    ({ error } = await db.from("tasks").update(savedPayload).eq("id", t.id));
    if (error && error.message && error.message.includes("due_date")) {
      savedPayload = { title, notes };
      ({ error } = await db.from("tasks").update(savedPayload).eq("id", t.id));
    }
  }
  if (error) { showNotif(error.message); return; }
  Object.assign(t, savedPayload);
  renderTasks(); renderProjects();
  g("btn-toggle-done").classList.toggle("done-active", t.done);
  g("toggle-done-label").textContent = t.done ? "Mark not done" : "Mark done";
}

// ── Task comments ─────────────────────────────────────────────
function renderComments() {
  const list = g("comment-list");
  const comments = S.comments.filter(c => c.task_id === S.activeTaskId);
  list.innerHTML = "";
  g("comment-count").textContent = String(comments.length);
  if (!comments.length) {
    list.innerHTML = `<div class="comment-empty">No comments yet.</div>`;
    return;
  }
  comments.forEach(comment => {
    const item = document.createElement("div");
    item.className = "comment-item";
    const body = document.createElement("p");
    body.textContent = comment.body;
    const meta = document.createElement("div");
    meta.className = "comment-meta";
    const time = document.createElement("span");
    time.textContent = new Date(comment.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.onclick = () => deleteComment(comment);
    meta.appendChild(time);
    meta.appendChild(del);
    item.appendChild(body);
    item.appendChild(meta);
    list.appendChild(item);
  });
}

g("btn-save-comment").onclick = saveComment;
g("new-comment-input").addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") saveComment();
});

async function saveComment() {
  const t = S.tasks.find(x => x.id === S.activeTaskId); if (!t) return;
  const body = g("new-comment-input").value.trim();
  if (!body) { g("new-comment-input").focus(); return; }
  g("btn-save-comment").disabled = true;
  const { data, error } = await db.from("task_comments").insert({ body, task_id: t.id, user_id: S.user.id }).select().single();
  g("btn-save-comment").disabled = false;
  if (error) return showNotif(error.message);
  S.comments.push(data);
  g("new-comment-input").value = "";
  renderComments();
}

async function deleteComment(comment) {
  const { error } = await db.from("task_comments").delete().eq("id", comment.id);
  if (error) return showNotif(error.message);
  S.comments = S.comments.filter(c => c.id !== comment.id);
  renderComments();
}

// ── Drawer labels ─────────────────────────────────────────────
function renderDrawerLabels() {
  const wrap = g("drawer-label-list"); wrap.innerHTML = "";
  const t = S.tasks.find(x => x.id === S.activeTaskId); if (!t) return;
  const assigned = new Set(S.taskLabels[t.id] || []);
  if (!S.labels.length) {
    wrap.innerHTML = `<span style="color:var(--text-3);font-size:13px">No labels yet — click "+ New label" to add one.</span>`;
    return;
  }
  S.labels.forEach(l => {
    const on   = assigned.has(l.id);
    const chip = mkChip(l.name, on, () => toggleTaskLabel(t.id, l.id));
    if (on) {
      const x = document.createElement("span"); x.className = "chip-x"; x.textContent = "×";
      x.onclick = e => { e.stopPropagation(); toggleTaskLabel(t.id, l.id); };
      chip.appendChild(x);
    }
    wrap.appendChild(chip);
  });
}
async function toggleTaskLabel(taskId, labelId) {
  const list = (S.taskLabels[taskId] ||= []);
  if (list.includes(labelId)) {
    const { error } = await db.from("task_labels").delete().eq("task_id", taskId).eq("label_id", labelId);
    if (error) return showNotif(error.message);
    S.taskLabels[taskId] = list.filter(x => x !== labelId);
  } else {
    const { error } = await db.from("task_labels").insert({ task_id: taskId, label_id: labelId, user_id: S.user.id });
    if (error) return showNotif(error.message);
    list.push(labelId);
  }
  renderDrawerLabels(); renderTasks();
}

g("btn-add-label").onclick    = () => { g("add-label-form").classList.remove("hidden"); g("new-label-input").focus(); };
g("btn-cancel-label").onclick = () => { g("add-label-form").classList.add("hidden"); g("new-label-input").value = ""; };
g("btn-save-label").onclick   = saveDrawerLabel;
g("new-label-input").addEventListener("keydown", e => {
  if (e.key === "Enter")  saveDrawerLabel();
  if (e.key === "Escape") { g("add-label-form").classList.add("hidden"); g("new-label-input").value = ""; }
});
async function saveDrawerLabel() {
  const name = g("new-label-input").value.trim(); if (!name) return;
  const { data, error } = await db.from("labels").insert({ name, user_id: S.user.id }).select().single();
  if (error) return showNotif(error.message);
  S.labels.push(data);
  g("add-label-form").classList.add("hidden"); g("new-label-input").value = "";
  renderDrawerLabels(); renderTasks();
}

// ── Mobile nav ────────────────────────────────────────────────
function mobile() { return window.matchMedia("(max-width:700px)").matches; }

// ⑥ Fixed: g("crumb") no longer exists after the breadcrumb refactor.
//    updateBreadcrumb() now owns all crumb state; openMobilePane only
//    controls which pane is visible.
function openMobilePane(which) {
  const sb = g("sidebar"), pp = g("projects-pane"), bd = g("backdrop");
  if (which === "folders") {
    sb.classList.add("open"); pp.classList.remove("open"); bd.classList.remove("hidden");
  } else if (which === "projects") {
    sb.classList.remove("open"); pp.classList.add("open"); bd.classList.remove("hidden");
  } else {
    sb.classList.remove("open"); pp.classList.remove("open"); bd.classList.add("hidden");
  }
  updateBreadcrumb();
}
g("btn-menu").onclick = () => {
  const open = g("sidebar").classList.contains("open") || g("projects-pane").classList.contains("open");
  open ? openMobilePane("tasks") : openMobilePane("folders");
};
g("backdrop").onclick = () => openMobilePane("tasks");
window.addEventListener("DOMContentLoaded", () => updateBreadcrumb());

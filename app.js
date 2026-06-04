// ── Config ──────────────────────────────────────────────────
const SUPABASE_URL     = "https://wgfdozmroijxubuiifjg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnZmRvem1yb2lqeHVidWlpZmpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzIxODgsImV4cCI6MjA5NjE0ODE4OH0.2HFVufskP_O8YvYJiUdxT6cooi0YC21lFxvt4-qpIP4";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ────────────────────────────────────────────────────
const S = {
  user: null,
  folders: [], projects: [], tasks: [], labels: [],
  taskLabels: {},           // taskId → [labelId]
  activeFolderId:  null,
  activeProjectId: null,
  activeTaskId:    null,
  filterLabels:    new Set(),
  pendingDelete:   null,    // { type, item, onConfirm }
};

// ── Helpers ──────────────────────────────────────────────────
const g = id => document.getElementById(id);

function setLoading(btn, on) {
  btn.classList.toggle("loading", on);
  btn.disabled = on;
}

// ── Auth ─────────────────────────────────────────────────────
function showPanel(id) {
  document.querySelectorAll(".auth-panel").forEach(p => p.classList.remove("active"));
  g(id).classList.add("active");
}

g("goto-signup").onclick    = () => showPanel("auth-signup");
g("goto-signin").onclick    = () => showPanel("auth-signin");
g("goto-signin-2").onclick  = () => showPanel("auth-signin");

g("btn-signin").onclick = () => doAuth("signin");
g("btn-signup").onclick = () => doAuth("signup");

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
  if (isSignup) { showPanel("auth-confirm"); }
}

g("btn-signout").onclick = async () => { await db.auth.signOut(); };

db.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    S.user = session.user;
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
  const [fr, pr, tr, lr, tlr] = await Promise.all([
    db.from("folders").select("*").order("created_at"),
    db.from("projects").select("*").order("created_at"),
    db.from("tasks").select("*").order("created_at"),
    db.from("labels").select("*").order("created_at"),
    db.from("task_labels").select("*"),
  ]);
  if (fr.error) { alert("Load error: " + fr.error.message); return; }
  S.folders  = fr.data  || [];
  S.projects = pr.data  || [];
  S.tasks    = tr.data  || [];
  S.labels   = lr.data  || [];
  S.taskLabels = {};
  (tlr.data || []).forEach(({ task_id, label_id }) => {
    (S.taskLabels[task_id] ||= []).push(label_id);
  });
  if (!S.activeFolderId && S.folders[0]) S.activeFolderId = S.folders[0].id;
  renderAll();
}

// ── Render ────────────────────────────────────────────────────
function renderAll() { renderFolders(); renderProjects(); renderTasks(); }

// ── Folders ──
function renderFolders() {
  const ul = g("folder-list"); ul.innerHTML = "";
  if (!S.folders.length) {
    ul.innerHTML = `<div class="empty-state"><strong>No folders yet</strong>Click + to create your first folder</div>`;
    return;
  }
  S.folders.forEach(f => {
    const count = S.projects.filter(p => p.folder_id === f.id).length;
    ul.appendChild(buildRowItem(f, count, f.id === S.activeFolderId, {
      onClick: () => { S.activeFolderId = f.id; S.activeProjectId = null; renderAll(); if (mobile()) openMobilePane("projects"); },
      onDelete: () => confirmDelete(`Delete folder "${f.name}" and all its projects and tasks?`, () => deleteFolder(f)),
    }));
  });
}

// ── Projects ──
function renderProjects() {
  const ul = g("project-list"); ul.innerHTML = "";
  const folder = S.folders.find(f => f.id === S.activeFolderId);
  g("projects-label").textContent = folder ? folder.name : "Projects";
  g("btn-add-project").disabled = !folder;
  if (!folder) { ul.innerHTML = `<div class="empty-state">Select a folder</div>`; return; }
  const items = S.projects.filter(p => p.folder_id === folder.id);
  if (!items.length) {
    ul.innerHTML = `<div class="empty-state"><strong>No projects yet</strong>Click + to create one</div>`;
    return;
  }
  items.forEach(p => {
    const count = S.tasks.filter(t => t.project_id === p.id).length;
    ul.appendChild(buildRowItem(p, count, p.id === S.activeProjectId, {
      onClick: () => { S.activeProjectId = p.id; renderAll(); if (mobile()) openMobilePane("tasks"); },
      onDelete: () => confirmDelete(`Delete project "${p.name}" and all its tasks?`, () => deleteProject(p)),
    }));
  });
}

// ── Tasks ──
function renderTasks() {
  const ul = g("task-list"); ul.innerHTML = "";
  const project = S.projects.find(p => p.id === S.activeProjectId);
  g("tasks-label").textContent = project ? project.name : "Tasks";
  g("btn-add-task").disabled = !project;
  // label filter bar
  const bar = g("label-filter-bar"), chips = g("label-chips");
  chips.innerHTML = "";
  if (S.labels.length) {
    bar.classList.remove("hidden");
    S.labels.forEach(l => {
      const on = S.filterLabels.has(l.id);
      const c = mkChip(l.name, on, () => { on ? S.filterLabels.delete(l.id) : S.filterLabels.add(l.id); renderTasks(); });
      chips.appendChild(c);
    });
  } else { bar.classList.add("hidden"); }
  if (!project) { ul.innerHTML = `<div class="empty-state">Select a project</div>`; return; }
  let items = S.tasks.filter(t => t.project_id === project.id);
  if (S.filterLabels.size) items = items.filter(t => [...S.filterLabels].every(id => (S.taskLabels[t.id]||[]).includes(id)));
  if (!items.length) { ul.innerHTML = `<div class="empty-state"><strong>No tasks yet</strong>Click + to add one</div>`; return; }
  items.forEach(t => {
    const li = document.createElement("li");
    li.className = "task-row" + (t.done ? " done" : "");
    li.onclick = () => openDrawer(t.id);
    // top row
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
    // label chips
    const lIds = S.taskLabels[t.id] || [];
    if (lIds.length) {
      const row = document.createElement("div");
      row.className = "task-chips";
      lIds.forEach(id => {
        const l = S.labels.find(x => x.id === id);
        if (l) row.appendChild(mkChip(l.name, false, null));
      });
      li.appendChild(row);
    }
    ul.appendChild(li);
  });
}

// ── Generic row item builder ──
function buildRowItem(item, count, active, { onClick, onDelete }) {
  const li = document.createElement("li");
  li.className = "row-item" + (active ? " active" : "");
  li.onclick = onClick;

  const name = document.createElement("span");
  name.className = "row-name";
  name.textContent = item.name;

  const cnt = document.createElement("span");
  cnt.className = "row-count";
  cnt.textContent = String(count);

  const del = document.createElement("button");
  del.className = "row-del";
  del.setAttribute("aria-label", "Delete");
  del.title = "Delete";
  del.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3h9M5 3V2a.5.5 0 01.5-.5h2A.5.5 0 018 2v1M10 3l-.7 7.5H3.7L3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  del.onclick = e => { e.stopPropagation(); onDelete(); };

  // inline confirm row (hidden until "confirming")
  const conf = document.createElement("div");
  conf.className = "row-del-confirm";
  const yes = document.createElement("button");
  yes.className = "del-yes"; yes.textContent = "Delete";
  yes.onclick = e => { e.stopPropagation(); li.classList.remove("confirming"); onDelete(); };
  const no = document.createElement("button");
  no.className = "del-no"; no.textContent = "Cancel";
  no.onclick = e => { e.stopPropagation(); li.classList.remove("confirming"); };
  conf.appendChild(yes); conf.appendChild(no);

  li.appendChild(name); li.appendChild(cnt); li.appendChild(del); li.appendChild(conf);
  return li;
}

function mkChip(text, on, onClick) {
  const s = document.createElement("span");
  s.className = "chip" + (on ? " on" : "");
  s.textContent = text;
  if (onClick) s.onclick = onClick;
  return s;
}

// ── Inline add row ──────────────────────────────────────────
function openInlineAdd(listEl, placeholder, onSave) {
  closeInlineAdd();
  const li = document.createElement("li");
  li.id = "_inline_add";
  li.className = "inline-add-row";

  const inp = document.createElement("input");
  inp.type = "text"; inp.placeholder = placeholder; inp.maxLength = 80;

  const save = document.createElement("button");
  save.className = "inline-confirm"; save.textContent = "Add";

  const cancel = document.createElement("button");
  cancel.className = "inline-x"; cancel.innerHTML = "×";

  li.appendChild(inp); li.appendChild(save); li.appendChild(cancel);
  listEl.appendChild(li);
  inp.focus();

  async function submit() {
    const val = inp.value.trim();
    if (!val) { inp.focus(); return; }
    save.disabled = true; save.textContent = "…";
    await onSave(val);
    closeInlineAdd();
  }
  inp.addEventListener("keydown", e => { if (e.key === "Enter") submit(); if (e.key === "Escape") closeInlineAdd(); });
  save.onclick = submit;
  cancel.onclick = closeInlineAdd;
}

function closeInlineAdd() {
  const el = g("_inline_add"); if (el) el.remove();
}

// ── Delete confirm (toast) ────────────────────────────────────
function confirmDelete(msg, onConfirm) {
  g("delete-toast-msg").textContent = msg;
  S.pendingDelete = onConfirm;
  g("delete-toast").classList.remove("hidden");
}
g("btn-delete-confirm").onclick = async () => {
  g("delete-toast").classList.add("hidden");
  if (S.pendingDelete) { await S.pendingDelete(); S.pendingDelete = null; }
};
g("btn-delete-cancel").onclick = () => {
  g("delete-toast").classList.add("hidden");
  S.pendingDelete = null;
};

// ── Mutations ─────────────────────────────────────────────────
g("btn-add-folder").onclick  = () => openInlineAdd(g("folder-list"), "Folder name…", addFolder);
g("btn-add-project").onclick = () => openInlineAdd(g("project-list"), "Project name…", addProject);
g("btn-add-task").onclick    = () => openInlineAdd(g("task-list"), "Task title…", addTask);

async function addFolder(name) {
  const { data, error } = await db.from("folders").insert({ name, user_id: S.user.id }).select().single();
  if (error) return alert(error.message);
  S.folders.push(data); S.activeFolderId = data.id; renderAll();
}
async function deleteFolder(f) {
  const { error } = await db.from("folders").delete().eq("id", f.id);
  if (error) return alert(error.message);
  S.folders   = S.folders.filter(x => x.id !== f.id);
  S.projects  = S.projects.filter(p => p.folder_id !== f.id);
  if (S.activeFolderId === f.id) { S.activeFolderId = S.folders[0]?.id ?? null; S.activeProjectId = null; }
  renderAll();
}

async function addProject(name) {
  const { data, error } = await db.from("projects").insert({ name, folder_id: S.activeFolderId, user_id: S.user.id }).select().single();
  if (error) return alert(error.message);
  S.projects.push(data); S.activeProjectId = data.id; renderAll();
}
async function deleteProject(p) {
  const { error } = await db.from("projects").delete().eq("id", p.id);
  if (error) return alert(error.message);
  S.projects = S.projects.filter(x => x.id !== p.id);
  S.tasks    = S.tasks.filter(t => t.project_id !== p.id);
  if (S.activeProjectId === p.id) S.activeProjectId = null;
  renderAll();
}

async function addTask(title) {
  const { data, error } = await db.from("tasks").insert({ title, project_id: S.activeProjectId, user_id: S.user.id, done: false }).select().single();
  if (error) return alert(error.message);
  S.tasks.push(data); renderTasks(); renderProjects();
}
async function toggleDone(t) {
  const next = !t.done;
  const { error } = await db.from("tasks").update({ done: next }).eq("id", t.id);
  if (error) return alert(error.message);
  t.done = next;
  renderTasks();
  // update drawer button if open
  if (S.activeTaskId === t.id) {
    g("btn-toggle-done").classList.toggle("done-active", next);
    g("toggle-done-label").textContent = next ? "Mark not done" : "Mark done";
  }
}
async function deleteTask() {
  const t = S.tasks.find(x => x.id === S.activeTaskId); if (!t) return;
  const { error } = await db.from("tasks").delete().eq("id", t.id);
  if (error) return alert(error.message);
  S.tasks = S.tasks.filter(x => x.id !== t.id);
  delete S.taskLabels[t.id];
  closeDrawer(); renderTasks(); renderProjects();
}

// ── Task drawer ──────────────────────────────────────────────
function openDrawer(id) {
  S.activeTaskId = id;
  const t = S.tasks.find(x => x.id === id); if (!t) return;
  g("task-title-input").value = t.title;
  g("task-notes-input").value = t.notes || "";
  g("btn-toggle-done").classList.toggle("done-active", t.done);
  g("toggle-done-label").textContent = t.done ? "Mark not done" : "Mark done";
  renderDrawerLabels();
  g("drawer").classList.remove("hidden");
  // hide mini label form
  g("add-label-form").classList.add("hidden");
  g("new-label-input").value = "";
}
function closeDrawer() { S.activeTaskId = null; g("drawer").classList.add("hidden"); }

g("btn-close-drawer").onclick = closeDrawer;
g("drawer").addEventListener("click", e => { if (e.target === g("drawer")) closeDrawer(); });
g("btn-toggle-done").onclick = () => { const t = S.tasks.find(x => x.id === S.activeTaskId); if (t) toggleDone(t); };
g("btn-delete-task").onclick = () => confirmDelete("Delete this task?", deleteTask);

// auto-save title / notes
let _saveTimer;
function schedSave() { clearTimeout(_saveTimer); _saveTimer = setTimeout(saveDrawerFields, 500); }
g("task-title-input").addEventListener("input", schedSave);
g("task-notes-input").addEventListener("input", schedSave);
async function saveDrawerFields() {
  const t = S.tasks.find(x => x.id === S.activeTaskId); if (!t) return;
  const title = g("task-title-input").value.trim() || "Untitled";
  const notes = g("task-notes-input").value;
  const { error } = await db.from("tasks").update({ title, notes }).eq("id", t.id);
  if (error) return;
  t.title = title; t.notes = notes; renderTasks();
}

// ── Labels (drawer) ──────────────────────────────────────────
function renderDrawerLabels() {
  const wrap = g("drawer-label-list"); wrap.innerHTML = "";
  const t = S.tasks.find(x => x.id === S.activeTaskId); if (!t) return;
  const assigned = new Set(S.taskLabels[t.id] || []);
  if (!S.labels.length) {
    wrap.innerHTML = `<span style="color:var(--text-3);font-size:13px">No labels yet — click "+ New label" to add one.</span>`;
    return;
  }
  S.labels.forEach(l => {
    const on = assigned.has(l.id);
    const chip = mkChip(l.name, on, () => toggleTaskLabel(t.id, l.id));
    // add remove button when assigned
    if (on) {
      const x = document.createElement("span");
      x.className = "chip-x"; x.textContent = "×";
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
    if (error) return alert(error.message);
    S.taskLabels[taskId] = list.filter(x => x !== labelId);
  } else {
    const { error } = await db.from("task_labels").insert({ task_id: taskId, label_id: labelId, user_id: S.user.id });
    if (error) return alert(error.message);
    list.push(labelId);
  }
  renderDrawerLabels(); renderTasks();
}

// New label form in drawer
g("btn-add-label").onclick = () => {
  g("add-label-form").classList.remove("hidden");
  g("new-label-input").focus();
};
g("btn-cancel-label").onclick = () => {
  g("add-label-form").classList.add("hidden");
  g("new-label-input").value = "";
};
g("btn-save-label").onclick = saveNewLabel;
g("new-label-input").addEventListener("keydown", e => {
  if (e.key === "Enter") saveNewLabel();
  if (e.key === "Escape") { g("add-label-form").classList.add("hidden"); g("new-label-input").value = ""; }
});
async function saveNewLabel() {
  const name = g("new-label-input").value.trim(); if (!name) return;
  const { data, error } = await db.from("labels").insert({ name, user_id: S.user.id }).select().single();
  if (error) return alert(error.message);
  S.labels.push(data);
  g("add-label-form").classList.add("hidden");
  g("new-label-input").value = "";
  renderDrawerLabels(); renderTasks();
}

// ── Mobile nav ───────────────────────────────────────────────
function mobile() { return window.matchMedia("(max-width:700px)").matches; }
function openMobilePane(which) {
  const sidebar = g("sidebar"), projects = g("projects-pane"), backdrop = g("backdrop");
  if (which === "folders") {
    sidebar.classList.add("open"); projects.classList.remove("open"); backdrop.classList.remove("hidden");
    g("crumb").textContent = "Folders";
  } else if (which === "projects") {
    sidebar.classList.remove("open"); projects.classList.add("open"); backdrop.classList.remove("hidden");
    g("crumb").textContent = S.folders.find(f => f.id === S.activeFolderId)?.name || "Projects";
  } else {
    sidebar.classList.remove("open"); projects.classList.remove("open"); backdrop.classList.add("hidden");
    g("crumb").textContent = S.projects.find(p => p.id === S.activeProjectId)?.name || "Tasks";
  }
}
g("btn-menu").onclick = () => {
  const sidebarOpen = g("sidebar").classList.contains("open");
  const projectsOpen = g("projects-pane").classList.contains("open");
  if (!sidebarOpen && !projectsOpen) openMobilePane("folders");
  else openMobilePane("tasks");
};
g("backdrop").onclick = () => openMobilePane("tasks");

// Init crumb
window.addEventListener("DOMContentLoaded", () => { g("crumb").textContent = "Tasks"; });

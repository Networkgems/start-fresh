// Start Fresh dashboard client. Vanilla JS, talks to the JSON API under /api.
// No framework/build step — matches the project's minimal stack.

const $ = (id) => document.getElementById(id);

const views = {
  auth: $("auth-view"),
  dash: $("dash-view"),
  case: $("case-view"),
};
function show(view) {
  for (const [k, el] of Object.entries(views)) el.classList.toggle("hidden", k !== view);
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { ok: res.ok, status: res.status, data };
}

// Human-readable error messages.
const ERRORS = {
  invalid_email: "Please enter a valid email address.",
  weak_password: "Password must be at least 8 characters.",
  email_taken: "An account with that email already exists.",
  invalid_credentials: "Incorrect email or password.",
  not_authenticated: "Please log in.",
  invalid_name: "Enter a name between 2 and 120 characters.",
};
const msg = (code) => ERRORS[code] || code || "Something went wrong.";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Auth ----------
let authMode = "login";

function renderAuthMode() {
  const isSignup = authMode === "signup";
  $("auth-title").textContent = isSignup ? "Create your account" : "Log in";
  $("auth-sub").textContent = isSignup
    ? "Start scanning and cleaning up your online reputation."
    : "Access your reputation reports and removals.";
  $("auth-submit").textContent = isSignup ? "Sign up" : "Log in";
  $("password").setAttribute("autocomplete", isSignup ? "new-password" : "current-password");
  $("tab-login").style.fontWeight = isSignup ? "400" : "700";
  $("tab-signup").style.fontWeight = isSignup ? "700" : "400";
  $("auth-error").textContent = "";
}

$("tab-login").onclick = () => { authMode = "login"; renderAuthMode(); };
$("tab-signup").onclick = () => { authMode = "signup"; renderAuthMode(); };

$("auth-form").onsubmit = async (e) => {
  e.preventDefault();
  $("auth-error").textContent = "";
  const email = $("email").value.trim();
  const password = $("password").value;
  const path = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
  const submit = $("auth-submit");
  submit.disabled = true;
  const { ok, data } = await api("POST", path, { email, password });
  submit.disabled = false;
  if (!ok) { $("auth-error").textContent = msg(data?.error); return; }
  currentUser = data.user;
  $("password").value = "";
  await enterDashboard();
};

// ---------- Session bootstrap ----------
let currentUser = null;

function renderUserbar() {
  const bar = $("userbar");
  if (currentUser) {
    bar.innerHTML = "";
    const span = document.createElement("span");
    span.textContent = currentUser.email;
    const btn = document.createElement("button");
    btn.className = "ghost";
    btn.textContent = "Log out";
    btn.onclick = logout;
    bar.append(span, btn);
  } else {
    bar.innerHTML = "";
  }
}

async function logout() {
  await api("POST", "/api/auth/logout");
  currentUser = null;
  renderUserbar();
  show("auth");
}

async function boot() {
  const { ok, data } = await api("GET", "/api/me");
  if (ok) {
    currentUser = data.user;
    await enterDashboard();
  } else {
    renderAuthMode();
    show("auth");
  }
}

// ---------- Dashboard ----------
async function enterDashboard() {
  renderUserbar();
  show("dash");
  await loadCases();
}

$("name-form").onsubmit = async (e) => {
  e.preventDefault();
  $("name-error").textContent = "";
  const name = $("subject").value.trim();
  const btn = $("scan-btn");
  btn.disabled = true;
  btn.textContent = "Scanning…";
  const { ok, data } = await api("POST", "/api/cases", { name });
  btn.disabled = false;
  btn.textContent = "Run report";
  if (!ok) { $("name-error").textContent = msg(data?.error); return; }
  $("subject").value = "";
  openCase(data.case.id);
};

async function loadCases() {
  const list = $("cases-list");
  list.innerHTML = '<div class="spinner">Loading…</div>';
  const { ok, data } = await api("GET", "/api/cases");
  if (!ok) { list.innerHTML = '<div class="empty">Could not load reports.</div>'; return; }
  if (!data.cases.length) {
    list.innerHTML = '<div class="empty">No reports yet. Run your first one above.</div>';
    return;
  }
  list.innerHTML = "";
  for (const c of data.cases) {
    const el = document.createElement("div");
    el.className = "case-item";
    el.innerHTML = `
      <div>
        <div class="name">${escapeHtml(c.subjectName)}</div>
        <div class="small">${c.findingCount} findings · ${c.removedCount}/${c.removalCount} removed</div>
      </div>
      <div class="small">Score <strong style="color:${scoreColor(c.score)}">${c.score ?? "—"}</strong></div>`;
    el.onclick = () => openCase(c.id);
    list.appendChild(el);
  }
}

function scoreColor(score) {
  if (score == null) return "var(--muted)";
  if (score >= 75) return "var(--good)";
  if (score >= 45) return "var(--warn)";
  return "var(--bad)";
}

// ---------- Case detail ----------
$("back-btn").onclick = async () => { show("dash"); await loadCases(); };

const CATEGORY_LABEL = {
  web: "Web result",
  data_broker: "Data broker",
  social: "Social profile",
  image: "Image",
};
const STATUS_LABEL = {
  pending: "Pending",
  submitted: "Submitted",
  in_progress: "In progress",
  removed: "Removed",
  rejected: "Rejected",
};

async function openCase(id) {
  show("case");
  $("case-name").textContent = "Loading…";
  $("case-summary").textContent = "";
  $("removals-list").innerHTML = '<div class="spinner">Loading…</div>';
  $("findings-list").innerHTML = "";
  const { ok, data } = await api("GET", `/api/cases/${id}`);
  if (!ok) { $("case-name").textContent = "Report not found."; return; }
  renderCase(data);
}

function renderCase({ case: c, report, removals }) {
  $("case-name").textContent = c.subjectName;
  $("case-summary").textContent = report.summary;
  $("score-num").textContent = report.score;
  $("score-num").style.color = scoreColor(report.score);
  const bar = $("score-bar");
  bar.style.width = `${report.score}%`;
  bar.style.background = scoreColor(report.score);

  // Removals
  const rl = $("removals-list");
  rl.innerHTML = "";
  if (!removals.length) {
    rl.innerHTML = '<div class="empty">No removable items in this report.</div>';
  }
  for (const r of removals) rl.appendChild(removalEl(c.id, r));

  // Findings
  const fl = $("findings-list");
  fl.innerHTML = "";
  const byCat = groupBy(report.findings, (f) => f.category);
  for (const cat of ["data_broker", "web", "social", "image"]) {
    const items = byCat[cat];
    if (!items?.length) continue;
    const h = document.createElement("h3");
    h.textContent = `${CATEGORY_LABEL[cat]}s (${items.length})`;
    fl.appendChild(h);
    for (const f of items) fl.appendChild(findingEl(f));
  }
}

function findingEl(f) {
  const el = document.createElement("div");
  el.className = "finding";
  const link = f.url
    ? `<a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(f.source)} ↗</a>`
    : escapeHtml(f.source);
  el.innerHTML = `
    <div class="head">
      <span class="title">${escapeHtml(f.title)}</span>
      <span class="pill sev-${f.severity}">${f.severity}</span>
    </div>
    <p class="snippet">${escapeHtml(f.snippet)}</p>
    <div class="small" style="color:var(--muted);font-size:.8rem;margin-top:.4rem">
      ${link}${f.removable ? " · removal tracked below" : " · not removable"}
    </div>`;
  return el;
}

function removalEl(caseId, r) {
  const el = document.createElement("div");
  el.className = "removal";
  const terminal = r.status === "removed" || r.status === "rejected";
  const actions = terminal
    ? ""
    : `<div class="actions-row">
         <button class="secondary" data-advance>Advance status</button>
         ${r.status === "pending" ? '<button class="ghost" data-reject>Mark not removable</button>' : ""}
       </div>`;
  el.innerHTML = `
    <div class="head">
      <div>
        <div class="title">${escapeHtml(r.target)}</div>
        <div class="channel">${escapeHtml(CATEGORY_LABEL[r.category])} · ${escapeHtml(r.channel)}</div>
      </div>
      <span class="status st-${r.status}">${STATUS_LABEL[r.status]}</span>
    </div>
    ${r.guidance ? guidanceBlock(r.guidance) : ""}
    ${r.takedown ? takedownBlock(r.takedown) : ""}
    ${actions}`;

  const advanceBtn = el.querySelector("[data-advance]");
  if (advanceBtn) advanceBtn.onclick = () => advance(caseId, r.id);
  const rejectBtn = el.querySelector("[data-reject]");
  if (rejectBtn) rejectBtn.onclick = () => advance(caseId, r.id, "rejected");
  return el;
}

// Guided disconnect / de-link instructions for a social removal (STA-7).
function guidanceBlock(g) {
  const steps = g.steps
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("");
  const controls = g.controls.length
    ? `<div class="guide-links">${g.controls
        .map(
          (c) =>
            `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.label)} ↗</a>`,
        )
        .join("")}</div>`
    : "";
  return `
    <details class="guide">
      <summary>How to disconnect on ${escapeHtml(g.platform)}</summary>
      <ol class="guide-steps">${steps}</ol>
      ${controls}
      <p class="guide-note">${escapeHtml(g.note)}</p>
    </details>`;
}

// Generated image takedown request for an image removal (STA-6). Shows the
// sanctioned channel and a pre-filled request the user reviews, copies, and
// submits through that channel — we never auto-submit on their behalf.
function takedownBlock(t) {
  return `
    <details class="guide">
      <summary>Takedown request — ${escapeHtml(t.channel)}</summary>
      <div class="guide-links">
        <a href="${escapeHtml(t.channelUrl)}" target="_blank" rel="noopener noreferrer">Open ${escapeHtml(t.channel)} ↗</a>
      </div>
      <div class="guide-note"><strong>Subject:</strong> ${escapeHtml(t.subject)}</div>
      <pre class="takedown-body">${escapeHtml(t.body)}</pre>
      <p class="guide-note">Review and submit this through the linked channel. We don't auto-submit or impersonate you.</p>
    </details>`;
}

async function advance(caseId, removalId, to) {
  const { ok, data } = await api(
    "POST",
    `/api/cases/${caseId}/removals/${removalId}/advance`,
    to ? { to } : undefined,
  );
  if (!ok) { alert(msg(data?.error)); return; }
  await openCase(caseId); // re-render with fresh state
}

// ---------- utils ----------
function groupBy(arr, keyFn) {
  const out = {};
  for (const item of arr) {
    const k = keyFn(item);
    (out[k] ||= []).push(item);
  }
  return out;
}

boot();

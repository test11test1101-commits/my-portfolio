/* ==========================================================================
   PORTFOLIO CMS ADMIN JAVASCRIPT
   Dual-Mode Support:
   1. Local Native Daemon (Python 3 + SQLite WAL)
   2. GitHub Pages Cloud Mode (Direct GitHub REST API & Commit Pipeline)
   ========================================================================== */

// Configuration for GitHub Pages Mode
const GITHUB_REPO = "test11test1101-commits/my-portfolio";
const GITHUB_BRANCH = "main";
const GITHUB_CONTENT_PATH = "content.json";

// State
let appData = {
  profile: {},
  capabilities: [],
  projects: []
};

let isGitHubMode = window.location.hostname.includes("github.io") || !!localStorage.getItem("portfolio_gh_token");
let currentContentSha = null;

// UI Elements
const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const toastEl = document.getElementById("toast");

const authTitle = document.getElementById("auth-title");
const authSub = document.getElementById("auth-sub");
const localAuthFields = document.getElementById("local-auth-fields");
const githubAuthFields = document.getElementById("github-auth-fields");
const githubTokenInput = document.getElementById("github-token");
const btnToggleMode = document.getElementById("btn-toggle-mode");
const btnToggleTokenVis = document.getElementById("btn-toggle-token-vis");
const modeBadge = document.getElementById("mode-badge");

// Toast Notification
function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.className = `toast show ${isError ? 'error' : ''}`;
  setTimeout(() => {
    toastEl.className = "toast";
  }, 4000);
}

// -----------------------------------------------------------------------------
// GITHUB API HELPERS
// -----------------------------------------------------------------------------

function getGhToken() {
  return localStorage.getItem("portfolio_gh_token") || "";
}

function getGhHeaders() {
  const token = getGhToken();
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json"
  };
}

// UTF-8 safe Base64 encoder/decoder
function utf8ToBase64(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
    return String.fromCharCode('0x' + p1);
  }));
}

function base64ToUtf8(str) {
  return decodeURIComponent(Array.prototype.map.call(atob(str), (c) => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
}

async function fetchFromGitHub(path) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}&_t=${Date.now()}`, {
    headers: getGhHeaders()
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error: ${res.statusText}`);
  }
  return await res.json();
}

async function commitToGitHub(path, contentStr, message, existingSha = null) {
  let sha = existingSha;
  if (!sha) {
    try {
      const existing = await fetchFromGitHub(path);
      sha = existing.sha;
    } catch (_) {
      sha = null;
    }
  }

  const payload = {
    message: message,
    content: utf8ToBase64(contentStr),
    branch: GITHUB_BRANCH
  };
  if (sha) payload.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
    method: "PUT",
    headers: getGhHeaders(),
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to commit to GitHub (${res.status})`);
  }

  const data = await res.json();
  return data.content ? data.content.sha : null;
}

async function uploadImageToGitHub(file) {
  const ext = file.name.split('.').pop().toLowerCase() || "jpg";
  const uniqueName = Date.now() + "-" + Math.random().toString(36).substring(2, 8) + "." + ext;
  const targetPath = `assets/uploads/images/${uniqueName}`;

  const base64Data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const payload = {
    message: `Upload project asset ${uniqueName} via CMS`,
    content: base64Data,
    branch: GITHUB_BRANCH
  };

  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${targetPath}`, {
    method: "PUT",
    headers: getGhHeaders(),
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to upload image to GitHub repository");
  }

  return targetPath;
}

// -----------------------------------------------------------------------------
// AUTHENTICATION & MODE SWITCHING
// -----------------------------------------------------------------------------

function setAuthModeUI(toGitHubMode) {
  isGitHubMode = toGitHubMode;
  if (isGitHubMode) {
    localAuthFields.hidden = true;
    githubAuthFields.hidden = false;
    authTitle.textContent = "Portfolio Cloud CMS";
    authSub.textContent = "Enter your GitHub Access Token to edit and publish live anytime";
    btnToggleMode.textContent = "Switch to Local Server Mode";
    document.getElementById("btn-login-submit").textContent = "Connect to GitHub →";
  } else {
    localAuthFields.hidden = false;
    githubAuthFields.hidden = true;
    authTitle.textContent = "Portfolio CMS";
    authSub.textContent = "Enter your credentials to access the admin dashboard";
    btnToggleMode.textContent = "Switch to GitHub Cloud Access Mode";
    document.getElementById("btn-login-submit").textContent = "Sign In →";
  }
}

btnToggleMode.addEventListener("click", () => {
  setAuthModeUI(!isGitHubMode);
});

btnToggleTokenVis.addEventListener("click", () => {
  const isPwd = githubTokenInput.type === "password";
  githubTokenInput.type = isPwd ? "text" : "password";
  btnToggleTokenVis.textContent = isPwd ? "🙈" : "👁";
});

// Check session on startup
async function checkAuth() {
  const token = getGhToken();

  // If on GitHub Pages or token already saved
  if (window.location.hostname.includes("github.io") || token) {
    setAuthModeUI(true);
    if (token) {
      try {
        const res = await fetch("https://api.github.com/user", { headers: getGhHeaders() });
        if (res.ok) {
          const user = await res.json();
          document.getElementById("current-username").textContent = user.login || "GitHub User";
          showDashboard();
          return;
        } else {
          localStorage.removeItem("portfolio_gh_token");
        }
      } catch (_) {}
    }
    showLogin();
    return;
  }

  // Local server check
  try {
    const res = await fetch("/api/admin/check");
    if (res.ok) {
      const data = await res.json();
      document.getElementById("current-username").textContent = data.username || "admin";
      setAuthModeUI(false);
      showDashboard();
    } else {
      setAuthModeUI(false);
      showLogin();
    }
  } catch (e) {
    // Local server not responding, switch to GitHub Cloud mode
    setAuthModeUI(true);
    showLogin();
  }
}

function showLogin() {
  loginView.hidden = false;
  loginView.style.display = "grid";
  dashboardView.hidden = true;
  dashboardView.style.display = "none";
}

function showDashboard() {
  loginView.hidden = true;
  loginView.style.display = "none";
  dashboardView.hidden = false;
  dashboardView.style.display = "block";

  if (modeBadge) {
    if (isGitHubMode) {
      modeBadge.textContent = "● GitHub Cloud Mode";
      modeBadge.style.background = "#e0e7ff";
      modeBadge.style.color = "#4338ca";
      document.getElementById("btn-open-pwd").textContent = "Update Token";
    } else {
      modeBadge.textContent = "● Local Mode";
      modeBadge.style.background = "#dcfce7";
      modeBadge.style.color = "#15803d";
      document.getElementById("btn-open-pwd").textContent = "Change Password";
    }
  }

  loadAdminData();
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;

  if (isGitHubMode) {
    // GitHub Cloud Mode Login
    const token = githubTokenInput.value.trim();
    if (!token) {
      loginError.textContent = "Please enter your GitHub Personal Access Token.";
      loginError.hidden = false;
      return;
    }

    try {
      showToast("Verifying GitHub Token...");
      const res = await fetch("https://api.github.com/user", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const user = await res.json();
        localStorage.setItem("portfolio_gh_token", token);
        document.getElementById("current-username").textContent = user.login;
        showDashboard();
        showToast("Connected to GitHub as " + user.login);
      } else {
        loginError.textContent = "Invalid GitHub Token. Please ensure it has 'repo' scope.";
        loginError.hidden = false;
      }
    } catch (err) {
      loginError.textContent = "Network error connecting to GitHub API.";
      loginError.hidden = false;
    }
    return;
  }

  // Local Server Mode Login
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      document.getElementById("current-username").textContent = data.username;
      loginForm.reset();
      showDashboard();
      showToast("Welcome back, " + data.username);
    } else {
      loginError.textContent = data.error || "Authentication failed";
      loginError.hidden = false;
    }
  } catch (err) {
    loginError.textContent = "Unable to connect to local server";
    loginError.hidden = false;
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  if (isGitHubMode) {
    localStorage.removeItem("portfolio_gh_token");
    showToast("Disconnected from GitHub");
    showLogin();
    return;
  }
  await fetch("/api/logout", { method: "POST" });
  showToast("Logged out successfully");
  showLogin();
});

// Password or Token Modal
const pwdModal = document.getElementById("password-modal");
document.getElementById("btn-open-pwd").addEventListener("click", () => {
  if (isGitHubMode) {
    const current = getGhToken();
    const updated = prompt("Enter new GitHub Personal Access Token:", current);
    if (updated !== null && updated.trim()) {
      localStorage.setItem("portfolio_gh_token", updated.trim());
      showToast("GitHub Token updated!");
    }
    return;
  }
  document.getElementById("password-form").reset();
  pwdModal.hidden = false;
});
document.getElementById("btn-close-pwd-modal").addEventListener("click", () => pwdModal.hidden = true);
document.getElementById("btn-cancel-pwd").addEventListener("click", () => pwdModal.hidden = true);

document.getElementById("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const current_password = document.getElementById("pwd-current").value;
  const new_password = document.getElementById("pwd-new").value;
  const confirm = document.getElementById("pwd-confirm").value;

  if (new_password !== confirm) {
    showToast("New passwords do not match", true);
    return;
  }

  try {
    const res = await fetch("/api/admin/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password, new_password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast("Password updated successfully");
      pwdModal.hidden = true;
    } else {
      showToast(data.error || "Password update failed", true);
    }
  } catch (err) {
    showToast("Error updating password", true);
  }
});

// -----------------------------------------------------------------------------
// TABS SWITCHER
// -----------------------------------------------------------------------------

const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    tabButtons.forEach(b => b.classList.toggle("active", b === btn));
    tabPanes.forEach(pane => pane.classList.toggle("active", pane.id === `tab-${target}`));
  });
});

// -----------------------------------------------------------------------------
// LOAD DATA
// -----------------------------------------------------------------------------

async function loadAdminData() {
  if (isGitHubMode) {
    try {
      showToast("Fetching live data from GitHub...");
      const fileData = await fetchFromGitHub(GITHUB_CONTENT_PATH);
      currentContentSha = fileData.sha;
      const rawText = base64ToUtf8(fileData.content);
      appData = JSON.parse(rawText);

      renderProjectsList();
      populateProfileForm();
      renderCapabilitiesForm();
      showToast("Data loaded from GitHub!");
    } catch (e) {
      showToast("Failed to fetch from GitHub: " + e.message, true);
    }
    return;
  }

  // Local Mode
  try {
    const res = await fetch("/api/admin/data");
    if (!res.ok) {
      if (res.status === 401) showLogin();
      return;
    }
    appData = await res.json();
    renderProjectsList();
    populateProfileForm();
    renderCapabilitiesForm();
  } catch (e) {
    showToast("Failed to load admin data", true);
  }
}

// -----------------------------------------------------------------------------
// TAB 1: PROJECTS MANAGEMENT
// -----------------------------------------------------------------------------

const projectsList = document.getElementById("projects-list");
const projectCountBadge = document.getElementById("project-count-badge");
const projectModal = document.getElementById("project-modal");
const projectForm = document.getElementById("project-form");

function renderProjectsList() {
  const projects = appData.projects || [];
  projectCountBadge.textContent = projects.length;

  if (projects.length === 0) {
    projectsList.innerHTML = `<div class="empty-state" style="padding: 30px; text-align: center; color: var(--muted);">No projects yet. Click "+ New Project" to add one!</div>`;
    return;
  }

  projectsList.innerHTML = projects.map((p, index) => {
    const thumbHtml = p.thumbnail
      ? `<img src="${p.thumbnail}" alt="" loading="lazy">`
      : `<span class="item-thumb-placeholder">${p.category === 'video' ? '🎬' : (p.category === 'support' ? '🛠️' : '💻')}</span>`;

    const isPublished = p.is_published !== false && p.is_published !== 0;
    const statusBadge = isPublished
      ? `<span class="status-indicator published">● Published</span>`
      : `<span class="status-indicator draft">○ Draft</span>`;

    const conceptBadge = p.is_concept ? `<span class="item-cat" style="color:#7928ca; background:#f4ebff;">Concept</span>` : '';

    return `
      <div class="project-item" data-id="${p.id}">
        <div class="reorder-handles">
          <button type="button" class="btn-icon" onclick="moveProject(${index}, -1)" ${index === 0 ? 'disabled' : ''} title="Move Up">↑</button>
          <button type="button" class="btn-icon" onclick="moveProject(${index}, 1)" ${index === projects.length - 1 ? 'disabled' : ''} title="Move Down">↓</button>
        </div>

        <div class="item-thumb-box">
          ${thumbHtml}
        </div>

        <div class="item-info">
          <div class="item-top">
            <span class="item-title">${escapeHtml(p.title)}</span>
            <span class="item-cat">${escapeHtml(p.category)}</span>
            ${conceptBadge}
          </div>
          <p class="item-desc">${escapeHtml(p.description)}</p>
        </div>

        <div class="item-status-col">
          ${statusBadge}
        </div>

        <div class="item-actions">
          <button type="button" class="btn btn-sm btn-outline" onclick="openEditProject(${p.id})">Edit</button>
          <button type="button" class="btn btn-sm btn-danger" onclick="deleteProject(${p.id})">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

// Move Project (Reorder)
window.moveProject = async function(index, direction) {
  const projects = appData.projects;
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= projects.length) return;

  const temp = projects[index];
  projects[index] = projects[targetIndex];
  projects[targetIndex] = temp;

  projects.forEach((p, i) => p.order_index = i + 1);
  renderProjectsList();

  if (isGitHubMode) {
    showToast("Committing new order to GitHub...");
    try {
      currentContentSha = await commitToGitHub(GITHUB_CONTENT_PATH, JSON.stringify(appData, null, 2), "Reorder projects via Cloud CMS", currentContentSha);
      showToast("Order committed to GitHub!");
    } catch (e) {
      showToast("Failed to commit order: " + e.message, true);
    }
    return;
  }

  const orderIds = projects.map(p => p.id);
  try {
    const res = await fetch("/api/admin/projects/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: orderIds })
    });
    if (res.ok) {
      showToast("Order saved");
    }
  } catch (e) {
    showToast("Error saving order", true);
  }
};

// Modal Openers
const modalTitle = document.getElementById("modal-title");
const projIdInput = document.getElementById("proj-id");
const projThumbInput = document.getElementById("proj-thumbnail");
const thumbFileInput = document.getElementById("thumb-file-input");
const thumbPreviewBox = document.getElementById("thumb-preview-box");
const thumbPreviewImg = document.getElementById("thumb-preview-img");

function clearThumbPreview() {
  if (projThumbInput) projThumbInput.value = "";
  if (thumbPreviewImg) thumbPreviewImg.src = "";
  if (thumbPreviewBox) thumbPreviewBox.hidden = true;
}

function setThumbPreview(url) {
  if (projThumbInput) projThumbInput.value = url;
  if (thumbPreviewImg) thumbPreviewImg.src = url;
  if (thumbPreviewBox) thumbPreviewBox.hidden = false;
}

window.openNewProject = function() {
  modalTitle.textContent = "New Project";
  projectForm.reset();
  projIdInput.value = "";
  clearThumbPreview();
  const conceptCheck = document.getElementById("proj-concept");
  if (conceptCheck) conceptCheck.checked = true;
  const pubCheck = document.getElementById("proj-published");
  if (pubCheck) pubCheck.checked = true;
  projectModal.hidden = false;
};

window.closeProjectModal = function() {
  projectModal.hidden = true;
};

const btnOpenProjectModal = document.getElementById("btn-new-project");
if (btnOpenProjectModal) {
  btnOpenProjectModal.addEventListener("click", window.openNewProject);
}

const btnCloseProjectModal = document.getElementById("btn-close-modal");
if (btnCloseProjectModal) {
  btnCloseProjectModal.addEventListener("click", window.closeProjectModal);
}

const btnCancelProject = document.getElementById("btn-cancel-modal");
if (btnCancelProject) {
  btnCancelProject.addEventListener("click", window.closeProjectModal);
}

window.openEditProject = function(id) {
  const p = appData.projects.find(item => item.id === id);
  if (!p) return;

  modalTitle.textContent = "Edit Project";
  projIdInput.value = p.id;
  document.getElementById("proj-title").value = p.title || "";
  document.getElementById("proj-category").value = p.category || "development";
  document.getElementById("proj-desc").value = p.description || "";
  document.getElementById("proj-scope").value = p.detailed_scope || "";
  document.getElementById("proj-video-url").value = p.video_url || "";
  document.getElementById("proj-demo-url").value = p.demo_url || "";
  document.getElementById("proj-github-url").value = p.github_url || "";
  document.getElementById("proj-tags").value = (p.tags || []).join(", ");
  document.getElementById("proj-concept").checked = Boolean(p.is_concept);
  document.getElementById("proj-published").checked = p.is_published !== false && p.is_published !== 0;

  if (p.thumbnail) {
    setThumbPreview(p.thumbnail);
  } else {
    clearThumbPreview();
  }

  projectModal.hidden = false;
};

document.getElementById("btn-remove-thumb").addEventListener("click", clearThumbPreview);

thumbFileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (isGitHubMode) {
    showToast("Uploading and committing image to GitHub...");
    try {
      const ghUrl = await uploadImageToGitHub(file);
      setThumbPreview(ghUrl);
      showToast("Image committed to repository!");
    } catch (e) {
      showToast("Image upload failed: " + e.message, true);
    }
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  showToast("Uploading thumbnail...");
  try {
    const res = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setThumbPreview(data.url);
      showToast("Thumbnail uploaded!");
    } else {
      showToast(data.error || "Upload failed", true);
    }
  } catch (err) {
    showToast("Error uploading file", true);
  }
});

// Save / Submit Project
projectForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const idStr = projIdInput.value;
  const id = idStr ? parseInt(idStr, 10) : null;

  const tags = document.getElementById("proj-tags").value
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);

  const projectData = {
    title: document.getElementById("proj-title").value.trim(),
    category: document.getElementById("proj-category").value,
    description: document.getElementById("proj-desc").value.trim(),
    detailed_scope: document.getElementById("proj-scope").value.trim(),
    thumbnail: projThumbInput.value.trim(),
    video_url: document.getElementById("proj-video-url").value.trim(),
    demo_url: document.getElementById("proj-demo-url").value.trim(),
    github_url: document.getElementById("proj-github-url").value.trim(),
    tags: tags,
    is_concept: document.getElementById("proj-concept").checked ? 1 : 0,
    is_published: document.getElementById("proj-published").checked ? 1 : 0
  };

  if (isGitHubMode) {
    if (!appData.projects) appData.projects = [];
    if (id) {
      const idx = appData.projects.findIndex(p => p.id === id);
      if (idx !== -1) {
        appData.projects[idx] = { ...appData.projects[idx], ...projectData };
      }
    } else {
      const nextId = appData.projects.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1;
      projectData.id = nextId;
      projectData.order_index = appData.projects.length + 1;
      projectData.gallery = [];
      appData.projects.push(projectData);
    }

    showToast("Committing project to GitHub...");
    try {
      currentContentSha = await commitToGitHub(GITHUB_CONTENT_PATH, JSON.stringify(appData, null, 2), `${id ? 'Update' : 'Create'} project "${projectData.title}" via Cloud CMS`, currentContentSha);
      projectModal.hidden = true;
      renderProjectsList();
      showToast("Project saved & committed to GitHub!");
    } catch (e) {
      showToast("Failed to save: " + e.message, true);
    }
    return;
  }

  // Local Mode
  const isEdit = Boolean(id);
  const url = isEdit ? `/api/admin/projects/${id}` : "/api/admin/projects";
  const method = isEdit ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(projectData)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      projectModal.hidden = true;
      showToast(isEdit ? "Project updated" : "Project created");
      loadAdminData();
    } else {
      showToast(data.error || "Save failed", true);
    }
  } catch (err) {
    showToast("Error saving project", true);
  }
});

// Delete Project
window.deleteProject = async function(id) {
  const p = appData.projects.find(item => item.id === id);
  const name = p ? `"${p.title}"` : "this project";
  if (!confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
    return;
  }

  if (isGitHubMode) {
    appData.projects = appData.projects.filter(item => item.id !== id);
    showToast("Committing deletion to GitHub...");
    try {
      currentContentSha = await commitToGitHub(GITHUB_CONTENT_PATH, JSON.stringify(appData, null, 2), `Delete project ${name} via Cloud CMS`, currentContentSha);
      renderProjectsList();
      showToast("Project deleted & committed to GitHub!");
    } catch (e) {
      showToast("Failed to delete: " + e.message, true);
    }
    return;
  }

  try {
    const res = await fetch(`/api/admin/projects/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast("Project deleted");
      loadAdminData();
    } else {
      showToast(data.error || "Delete failed", true);
    }
  } catch (e) {
    showToast("Error deleting project", true);
  }
};

// -----------------------------------------------------------------------------
// TAB 2: PROFILE & CONTACT MANAGEMENT
// -----------------------------------------------------------------------------

function populateProfileForm() {
  const p = appData.profile || {};
  document.getElementById("prof-name").value = p.name || "";
  document.getElementById("prof-headline").value = p.headline || "";
  document.getElementById("prof-intro").value = p.intro || "";
  document.getElementById("prof-bio").value = p.bio || "";
  document.getElementById("prof-approach").value = p.approach || "";
  document.getElementById("prof-location").value = p.location || "";
  document.getElementById("prof-email").value = p.email || "";
  document.getElementById("prof-github").value = p.github || "";
  document.getElementById("prof-linkedin").value = p.linkedin || "";
}

document.getElementById("btn-save-profile").addEventListener("click", async () => {
  const payload = {
    name: document.getElementById("prof-name").value,
    headline: document.getElementById("prof-headline").value,
    intro: document.getElementById("prof-intro").value,
    bio: document.getElementById("prof-bio").value,
    approach: document.getElementById("prof-approach").value,
    location: document.getElementById("prof-location").value,
    email: document.getElementById("prof-email").value,
    github: document.getElementById("prof-github").value,
    linkedin: document.getElementById("prof-linkedin").value
  };

  if (isGitHubMode) {
    appData.profile = payload;
    showToast("Committing profile update to GitHub...");
    try {
      currentContentSha = await commitToGitHub(GITHUB_CONTENT_PATH, JSON.stringify(appData, null, 2), "Update profile via Cloud CMS", currentContentSha);
      showToast("Profile saved & committed to GitHub! Live site updates in ~30s.");
    } catch (e) {
      showToast("Failed to save: " + e.message, true);
    }
    return;
  }

  try {
    const res = await fetch("/api/admin/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast("Profile information saved successfully");
    } else {
      showToast(data.error || "Save failed", true);
    }
  } catch (e) {
    showToast("Error saving profile", true);
  }
});

// -----------------------------------------------------------------------------
// TAB 3: CAPABILITIES MANAGEMENT
// -----------------------------------------------------------------------------

const capabilitiesContainer = document.getElementById("capabilities-container");

function renderCapabilitiesForm() {
  const caps = appData.capabilities || [];
  capabilitiesContainer.innerHTML = caps.map((c, i) => `
    <div class="cap-card card" data-index="${i}">
      <h4>Capability 0${i + 1}</h4>
      <div class="form-group">
        <label>Title</label>
        <input type="text" class="cap-title-input" value="${escapeHtml(c.title)}">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea rows="4" class="cap-desc-input">${escapeHtml(c.description)}</textarea>
      </div>
      <div class="form-group">
        <label>Icon Style</label>
        <select class="cap-icon-select">
          <option value="code" ${c.icon_type === 'code' ? 'selected' : ''}>Code Brackets (&lt;/&gt;)</option>
          <option value="support" ${c.icon_type === 'support' ? 'selected' : ''}>IT Support / Laptop</option>
          <option value="video" ${c.icon_type === 'video' ? 'selected' : ''}>Video / Play Triangle</option>
        </select>
      </div>
    </div>
  `).join("");
}

document.getElementById("btn-save-capabilities").addEventListener("click", async () => {
  const cards = capabilitiesContainer.querySelectorAll(".cap-card");
  const caps = Array.from(cards).map(card => ({
    title: card.querySelector(".cap-title-input").value.trim(),
    description: card.querySelector(".cap-desc-input").value.trim(),
    icon_type: card.querySelector(".cap-icon-select").value
  }));

  if (isGitHubMode) {
    appData.capabilities = caps;
    showToast("Committing capabilities to GitHub...");
    try {
      currentContentSha = await commitToGitHub(GITHUB_CONTENT_PATH, JSON.stringify(appData, null, 2), "Update capabilities via Cloud CMS", currentContentSha);
      showToast("Capabilities saved & committed to GitHub! Live site updates in ~30s.");
    } catch (e) {
      showToast("Failed to save: " + e.message, true);
    }
    return;
  }

  try {
    const res = await fetch("/api/admin/capabilities", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capabilities: caps })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast("Capabilities updated successfully");
    } else {
      showToast(data.error || "Update failed", true);
    }
  } catch (e) {
    showToast("Error saving capabilities", true);
  }
});

// -----------------------------------------------------------------------------
// TAB 4: BACKUP & RESTORE
// -----------------------------------------------------------------------------

const restoreForm = document.getElementById("restore-form");
const restoreFileInput = document.getElementById("restore-file-input");

// In GitHub mode, handle backup download as JSON
document.querySelector(".backup-card .btn-primary").addEventListener("click", (e) => {
  if (isGitHubMode) {
    e.preventDefault();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    showToast("Downloaded portfolio backup JSON!");
  }
});

restoreForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = restoreFileInput.files[0];
  if (!file) return;

  if (!confirm("WARNING: Restoring will overwrite the current content with the backup file. Proceed?")) {
    return;
  }

  if (isGitHubMode) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.profile && !parsed.projects) {
        throw new Error("Invalid portfolio JSON backup format");
      }
      appData = parsed;
      showToast("Committing restored data to GitHub...");
      currentContentSha = await commitToGitHub(GITHUB_CONTENT_PATH, JSON.stringify(appData, null, 2), "Restore portfolio backup via Cloud CMS", currentContentSha);
      renderProjectsList();
      populateProfileForm();
      renderCapabilitiesForm();
      showToast("Backup restored & committed to GitHub!");
    } catch (e) {
      showToast("Restore failed: " + e.message, true);
    }
    return;
  }

  const formData = new FormData();
  formData.append("backup_file", file);

  showToast("Restoring system backup... please wait.");
  try {
    const res = await fetch("/api/admin/restore", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast("System backup restored successfully!");
      restoreForm.reset();
      loadAdminData();
    } else {
      showToast(data.error || "Restore failed", true);
    }
  } catch (err) {
    showToast("Error restoring backup", true);
  }
});

// Helper: Escape HTML
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Start
checkAuth();

/* ==========================================================================
   PORTFOLIO CMS ADMIN JAVASCRIPT
   Authentication, Project CRUD, Media Uploads, and Backup/Restore
   ========================================================================== */

// State
let appData = {
  profile: {},
  capabilities: [],
  projects: []
};

// UI Elements
const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const toastEl = document.getElementById("toast");

// Toast Notification
function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.className = `toast show ${isError ? 'error' : ''}`;
  setTimeout(() => {
    toastEl.className = "toast";
  }, 3500);
}

// Check session on startup
async function checkAuth() {
  try {
    const res = await fetch("/api/admin/check");
    if (res.ok) {
      const data = await res.json();
      document.getElementById("current-username").textContent = data.username || "admin";
      showDashboard();
    } else {
      showLogin();
    }
  } catch (e) {
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
  loadAdminData();
}

// -----------------------------------------------------------------------------
// AUTHENTICATION HANDLERS
// -----------------------------------------------------------------------------

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
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
    loginError.textContent = "Unable to connect to server";
    loginError.hidden = false;
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  showToast("Logged out successfully");
  showLogin();
});

// Password change modal
const pwdModal = document.getElementById("password-modal");
document.getElementById("btn-open-pwd").addEventListener("click", () => {
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
// LOAD ALL DATA FROM BACKEND
// -----------------------------------------------------------------------------

async function loadAdminData() {
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

    const statusBadge = p.is_published
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

  renderProjectsList();

  const orderIds = projects.map(p => p.id);
  try {
    const res = await fetch("/api/admin/projects/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: orderIds })
    });
    if (!res.ok) throw new Error();
    showToast("Project order updated");
  } catch (e) {
    showToast("Failed to save project order", true);
    loadAdminData();
  }
};

// Modal Openers
document.getElementById("btn-new-project").addEventListener("click", () => {
  projectForm.reset();
  document.getElementById("proj-id").value = "";
  document.getElementById("modal-title").textContent = "New Project";
  document.getElementById("proj-concept").checked = true;
  document.getElementById("proj-published").checked = true;
  clearThumbPreview();
  projectModal.hidden = false;
});

document.getElementById("btn-close-modal").addEventListener("click", () => projectModal.hidden = true);
document.getElementById("btn-cancel-modal").addEventListener("click", () => projectModal.hidden = true);

window.openEditProject = function(id) {
  const p = appData.projects.find(item => item.id === id);
  if (!p) return;

  document.getElementById("proj-id").value = p.id;
  document.getElementById("modal-title").textContent = `Edit Project — ${p.title}`;
  document.getElementById("proj-title").value = p.title;
  document.getElementById("proj-category").value = p.category;
  document.getElementById("proj-desc").value = p.description;
  document.getElementById("proj-scope").value = p.detailed_scope || "";
  document.getElementById("proj-video-url").value = p.video_url || "";
  document.getElementById("proj-demo-url").value = p.demo_url || "";
  document.getElementById("proj-github-url").value = p.github_url || "";
  document.getElementById("proj-tags").value = (p.tags || []).join(", ");
  document.getElementById("proj-concept").checked = Boolean(p.is_concept);
  document.getElementById("proj-published").checked = Boolean(p.is_published);

  if (p.thumbnail) {
    setThumbPreview(p.thumbnail);
  } else {
    clearThumbPreview();
  }

  projectModal.hidden = false;
};

// Thumbnail & Media Upload Handling
const thumbFileInput = document.getElementById("thumb-file-input");
const thumbPreviewBox = document.getElementById("thumb-preview-box");
const thumbPreviewImg = document.getElementById("thumb-preview-img");
const thumbUploadPrompt = document.getElementById("thumb-upload-prompt");
const projThumbInput = document.getElementById("proj-thumbnail");

function setThumbPreview(url) {
  projThumbInput.value = url;
  thumbPreviewImg.src = url;
  thumbPreviewBox.hidden = false;
  thumbUploadPrompt.hidden = true;
}

function clearThumbPreview() {
  projThumbInput.value = "";
  thumbPreviewImg.src = "";
  thumbPreviewBox.hidden = true;
  thumbUploadPrompt.hidden = false;
}

document.getElementById("btn-remove-thumb").addEventListener("click", clearThumbPreview);

thumbFileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

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

// Video File Upload Handling
const videoFileInput = document.getElementById("video-file-input");
videoFileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  showToast("Uploading video (this may take a few seconds)...");
  try {
    const res = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.success) {
      document.getElementById("proj-video-url").value = data.url;
      showToast("Video uploaded and linked!");
    } else {
      showToast(data.error || "Video upload failed", true);
    }
  } catch (err) {
    showToast("Error uploading video", true);
  }
});

// Save Project (Create / Edit)
projectForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("proj-id").value;
  const tags = document.getElementById("proj-tags").value
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);

  const payload = {
    title: document.getElementById("proj-title").value.trim(),
    category: document.getElementById("proj-category").value,
    description: document.getElementById("proj-desc").value.trim(),
    detailed_scope: document.getElementById("proj-scope").value.trim(),
    thumbnail: projThumbInput.value.trim(),
    video_url: document.getElementById("proj-video-url").value.trim(),
    demo_url: document.getElementById("proj-demo-url").value.trim(),
    github_url: document.getElementById("proj-github-url").value.trim(),
    tags: tags,
    is_concept: document.getElementById("proj-concept").checked,
    is_published: document.getElementById("proj-published").checked
  };

  const isEdit = Boolean(id);
  const url = isEdit ? `/api/admin/projects/${id}` : "/api/admin/projects";
  const method = isEdit ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
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

restoreForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = restoreFileInput.files[0];
  if (!file) return;

  if (!confirm("WARNING: Restoring will overwrite the current database and media uploads with the contents of this backup. Are you sure you wish to proceed?")) {
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

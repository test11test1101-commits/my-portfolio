/* ==========================================================================
   PORTFOLIO SPECIALTY ARCHIVE SCRIPT
   Dynamic loader for video.html, development.html, support.html, and projects.html
   ========================================================================== */

const portfolioProfile = {
  name: "Richard Ong",
  email: "reinard328@gmail.com",
  location: "Lucena City, Philippines (GMT+8 / PHT)",
  github: "https://reianrd328.github.io/myprofile/",
  linkedin: "https://www.linkedin.com/in/richard-ong-b93155384"
};

/* 1. Theme Contrast Toggle */
const contrastButton = document.querySelector(".contrast-toggle");
const contrastKey = "portfolio-high-contrast";

function setContrast(enabled, remember = true) {
  document.documentElement.dataset.contrast = enabled ? "high" : "default";
  if (contrastButton) {
    contrastButton.setAttribute("aria-pressed", String(enabled));
  }
  if (remember) {
    try {
      localStorage.setItem(contrastKey, enabled ? "high" : "default");
    } catch (_) {}
  }
}

let savedContrast = false;
try {
  savedContrast = localStorage.getItem(contrastKey) === "high";
} catch (_) {}
setContrast(savedContrast, false);

if (contrastButton) {
  contrastButton.hidden = false;
  contrastButton.addEventListener("click", () => {
    const isCurrentlyPressed = contrastButton.getAttribute("aria-pressed") === "true";
    setContrast(!isCurrentlyPressed);
  });
}

/* 2. Accessible Mobile Navigation */
const menuButton = document.querySelector(".menu-toggle");
const navigation = document.getElementById("navigation");
if (menuButton && navigation) {
  menuButton.hidden = false;
  navigation.classList.add("js-collapsible");

  function closeMenu() {
    menuButton.setAttribute("aria-expanded", "false");
    navigation.classList.remove("is-open");
  }

  function toggleMenu() {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    navigation.classList.toggle("is-open", !isOpen);
  }

  menuButton.addEventListener("click", toggleMenu);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") closeMenu();
  });
  document.addEventListener("click", e => {
    if (!navigation.contains(e.target) && !menuButton.contains(e.target)) {
      if (menuButton.getAttribute("aria-expanded") === "true") closeMenu();
    }
  });
}

/* 3. HTML Escaping Utility */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* 4. Update Profile Info on Page */
function updateProfileDOM() {
  document.querySelectorAll("[data-profile]").forEach(node => {
    const key = node.dataset.profile;
    if (key && portfolioProfile[key]) {
      node.textContent = portfolioProfile[key];
    }
  });

  ["email-link", "contact-arrow", "footer-email"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.href = `mailto:${portfolioProfile.email}`;
  });
}

/* 5. Video Lightbox Modal */
let activeLightbox = null;

function openVideoLightbox(title, videoUrl, thumbnail, desc) {
  closeVideoLightbox();

  const lightbox = document.createElement("div");
  lightbox.className = "video-lightbox";
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.setAttribute("aria-label", title);

  let mediaBody = "";
  if (videoUrl && (videoUrl.endsWith(".mp4") || videoUrl.endsWith(".webm") || videoUrl.endsWith(".mov"))) {
    mediaBody = `<video src="${escapeHtml(videoUrl)}" controls autoplay style="width:100%; max-height:70vh; display:block; background:#000;"></video>`;
  } else if (thumbnail) {
    mediaBody = `<img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(title)}" style="width:100%; max-height:70vh; object-fit:contain; display:block; background:#000;">`;
  }

  lightbox.innerHTML = `
    <div class="video-lightbox-content">
      <button class="video-lightbox-close" type="button" aria-label="Close dialog">✕</button>
      ${mediaBody}
      <div style="padding: 20px 24px;">
        <h3 style="color:#ffffff; margin:0 0 8px; font-size:20px;">${escapeHtml(title)}</h3>
        <p style="color:#a8b0c8; font-size:13.5px; margin:0; line-height:1.5;">${escapeHtml(desc)}</p>
        ${videoUrl && !videoUrl.endsWith(".mp4") && !videoUrl.endsWith(".webm") ? `
          <div style="margin-top:14px;">
            <a href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="display:inline-flex; align-items:center; gap:6px; padding:8px 16px; background:var(--accent); color:#fff; border-radius:8px; font-size:12px; font-weight:700; text-decoration:none;">Watch External Video ↗</a>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  lightbox.querySelector(".video-lightbox-close").onclick = closeVideoLightbox;
  lightbox.onclick = (e) => {
    if (e.target === lightbox) closeVideoLightbox();
  };

  document.body.appendChild(lightbox);
  document.body.style.overflow = "hidden";
  activeLightbox = lightbox;
}

function closeVideoLightbox() {
  if (activeLightbox) {
    activeLightbox.remove();
    activeLightbox = null;
    document.body.style.overflow = "";
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && activeLightbox) {
    closeVideoLightbox();
  }
});

/* 6. Dynamic Content Loader & Renderer */
async function loadArchiveData() {
  const pageCategory = document.body.dataset.pageCategory || "all";
  const gridContainer = document.getElementById("archive-grid");
  const countBadge = document.getElementById("archive-count-badge");
  const countSummary = document.getElementById("archive-count-summary");

  try {
    let res = null;
    try {
      res = await fetch(`./content.json?_t=${Date.now()}`);
    } catch (_) {}

    if (!res || !res.ok) {
      try {
        res = await fetch("/api/content");
      } catch (_) {}
    }

    if (!res || !res.ok) return;
    const data = await res.json();
    if (!data.success) return;

    if (data.profile) {
      Object.assign(portfolioProfile, data.profile);
      updateProfileDOM();
    }

    const allProjects = Array.isArray(data.projects) ? data.projects : [];
    // Only published projects
    const published = allProjects.filter(p => p.is_published !== 0 && p.is_published !== false);

    // Filter by page category if not 'all'
    let currentFilter = pageCategory;
    if (pageCategory === "all") {
      const urlParams = new URLSearchParams(window.location.search);
      const paramCat = urlParams.get("category");
      if (paramCat && ["development", "video", "support"].includes(paramCat)) {
        currentFilter = paramCat;
      }
    }

    renderFilteredProjects(published, currentFilter, gridContainer, countBadge, countSummary);

    // Setup filter tabs if on projects.html
    setupArchiveFilterTabs(published, gridContainer, countBadge, countSummary);

  } catch (err) {
    console.log("Could not load dynamic archive:", err);
  }
}

function renderFilteredProjects(published, category, container, countBadge, countSummary) {
  if (!container) return;

  const filtered = category === "all" ? published : published.filter(p => p.category === category);

  if (countBadge) {
    countBadge.textContent = filtered.length;
  }
  if (countSummary) {
    countSummary.textContent = `Showing ${filtered.length} project${filtered.length === 1 ? '' : 's'}`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-archive" style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--muted);">
        <p style="font-size: 16px; margin-bottom: 12px;">No projects published in this specialty yet.</p>
        <a href="index.html" class="btn btn-outline" style="display:inline-block; padding:8px 18px; border:1px solid var(--accent); color:var(--accent); border-radius:8px; text-decoration:none; font-weight:600;">← Back to Home</a>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((p, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    const isVideo = p.category === "video";

    let mediaHtml = "";
    if (p.thumbnail) {
      mediaHtml = `
        <div class="project-visual video-visual" style="padding:0; overflow:hidden; border-radius:10px; cursor:${isVideo ? 'pointer' : 'default'};">
          <div class="video-preview-frame full-radius" style="position:relative; width:100%; height:230px;">
            <img src="${escapeHtml(p.thumbnail)}" alt="${escapeHtml(p.title)}" style="width:100%; height:100%; object-fit:cover;" loading="lazy">
            ${isVideo ? `
              <div class="video-play-disc" aria-label="Play ${escapeHtml(p.title)}">
                <span class="play-triangle">▶</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    } else if (p.video_url && (p.video_url.endsWith(".mp4") || p.video_url.endsWith(".webm") || p.video_url.endsWith(".mov"))) {
      mediaHtml = `
        <div class="project-visual video-visual" style="height: 230px; padding:0; overflow:hidden; border-radius:10px;">
          <video src="${escapeHtml(p.video_url)}" controls style="width:100%; height:100%; object-fit:cover;"></video>
        </div>
      `;
    } else {
      mediaHtml = `
        <div class="project-visual" style="height: 210px; display:grid; place-items:center; background: linear-gradient(135deg, #e9edf6, #dce2ef); color: var(--accent); font-size: 42px; border-radius: 10px;">
          <span>${p.category === 'video' ? '🎬' : (p.category === 'support' ? '🛠️' : '💻')}</span>
        </div>
      `;
    }

    const tagsHtml = (p.tags || []).map(t => `<span>${escapeHtml(t)}</span>`).join("");

    const linksHtml = `
      ${p.demo_url ? `<a href="${escapeHtml(p.demo_url)}" target="_blank" rel="noopener noreferrer" class="project-live-link">Live Demo ↗</a>` : ''}
      ${p.github_url ? `<a href="${escapeHtml(p.github_url)}" target="_blank" rel="noopener noreferrer" class="project-live-link" style="margin-left: 12px;">GitHub ↗</a>` : ''}
      ${p.video_url && !p.video_url.endsWith(".mp4") && !p.video_url.endsWith(".webm") ? `<a href="${escapeHtml(p.video_url)}" target="_blank" rel="noopener noreferrer" class="project-live-link" style="margin-left: 12px;">Watch Video ↗</a>` : ''}
    `;

    return `
      <article class="project-card glass" data-id="${p.id}" data-category="${escapeHtml(p.category)}">
        <div class="project-label">
          <span class="concept-badge"><i class="status-dot green"></i> ${p.is_concept ? 'CONCEPT PROJECT' : 'PROJECT'}</span>
          <span class="project-num">${num}</span>
        </div>

        <div class="card-media-wrapper" onclick="handleCardMediaClick(${p.id})">
          ${mediaHtml}
        </div>

        <div class="project-copy">
          <div class="project-copy-main">
            <h3>${escapeHtml(p.title)}</h3>
            <p>${escapeHtml(p.description)}</p>
            <div class="tags">${tagsHtml}</div>
            ${p.detailed_scope ? `
              <details class="concept-disclosure">
                <summary>Explore details <span class="summary-arrow" aria-hidden="true">↗</span></summary>
                <div class="disclosure-body">
                  <p>${escapeHtml(p.detailed_scope)}</p>
                  ${linksHtml}
                </div>
              </details>
            ` : (linksHtml.trim() ? `<div style="padding-top:8px;">${linksHtml}</div>` : '')}
          </div>
        </div>
      </article>
    `;
  }).join("");

  // Store filtered list globally for click handlers
  window.__currentArchiveProjects = filtered;
}

window.handleCardMediaClick = function(id) {
  const projects = window.__currentArchiveProjects || [];
  const p = projects.find(item => item.id === id);
  if (!p) return;

  if (p.category === "video" || p.video_url) {
    openVideoLightbox(p.title, p.video_url, p.thumbnail, p.description);
  }
};

function setupArchiveFilterTabs(published, container, countBadge, countSummary) {
  const tabs = document.querySelectorAll(".archive-tab");
  if (!tabs || tabs.length === 0) return;

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const cat = tab.dataset.filter || "all";
      tabs.forEach(t => t.classList.toggle("active", t === tab));
      renderFilteredProjects(published, cat, container, countBadge, countSummary);
    });
  });
}

// Initialize on page load
loadArchiveData();

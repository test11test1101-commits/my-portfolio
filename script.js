/* ==========================================================================
   PORTFOLIO SCRIPTS
   Dynamic CMS integration with static fallback, theme contrast toggle,
   category filter tabs, and accessible mobile navigation.
   ========================================================================== */

const portfolio = {
  name: "Your Name",
  email: "hello@example.com",
  location: "[Your city / time zone]",
  bio: "[Your biography: introduce yourself, your background, and what draws you to programming, technical support, and video editing.]",
  approach: "[Your approach: describe how you work, the tools you actually use, and the kinds of projects or roles you would like to explore.]",
  github: "",
  linkedin: "",
  projectLinks: {
    development: "",
    support: "",
    video: ""
  }
};

/* --------------------------------------------------------------------------
   1. Theme Contrast Toggle (High Contrast & Default)
   -------------------------------------------------------------------------- */
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
    } catch (e) {
      // Fallback for restricted private storage
    }
  }
}

let savedContrast = false;
try {
  savedContrast = localStorage.getItem(contrastKey) === "high";
} catch (e) {
  savedContrast = false;
}

setContrast(savedContrast, false);

if (contrastButton) {
  contrastButton.hidden = false;
  contrastButton.addEventListener("click", () => {
    const isCurrentlyPressed = contrastButton.getAttribute("aria-pressed") === "true";
    setContrast(!isCurrentlyPressed);
  });
}

/* --------------------------------------------------------------------------
   2. DOM Population & Profile Update Helpers
   -------------------------------------------------------------------------- */
function updateProfileDOM() {
  document.querySelectorAll("[data-profile]").forEach(node => {
    const key = node.dataset.profile;
    if (key && portfolio[key] !== undefined) {
      if (key === "headline") {
        node.innerHTML = portfolio[key].split("\n").map(l => escapeHtml(l)).join("<br>");
      } else {
        node.textContent = portfolio[key];
      }
    }
  });

  document.title = `${portfolio.name} — Code. Systems. Stories.`;

  // Update email links
  ["email-link", "contact-arrow", "footer-email"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.href = `mailto:${portfolio.email}`;
  });

  // Update social links if URLs provided
  updateSocialLinks();
}

function validateHttpUrl(string) {
  try {
    const url = new URL(string);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function updateSocialLinks() {
  document.querySelectorAll("[data-social]").forEach(placeholder => {
    const key = placeholder.dataset.social;
    const verifiedUrl = validateHttpUrl(portfolio[key]);
    if (!verifiedUrl) return;

    if (placeholder.tagName === "A") {
      placeholder.href = verifiedUrl;
      return;
    }

    const link = document.createElement("a");
    const platformName = key === "github" ? "GitHub" : "LinkedIn";
    const icon = placeholder.querySelector("svg");
    if (icon) {
      link.appendChild(icon.cloneNode(true));
    }
    link.appendChild(document.createTextNode(` ${platformName} ↗`));
    link.href = verifiedUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.dataset.social = key;
    link.setAttribute("aria-label", `${platformName} (opens in a new tab)`);
    placeholder.replaceWith(link);
  });
}

updateProfileDOM();

/* --------------------------------------------------------------------------
   3. Accessible Mobile Navigation
   -------------------------------------------------------------------------- */
const menuButton = document.querySelector(".menu-toggle");
const navigation = document.getElementById("navigation");

if (menuButton && navigation) {
  menuButton.hidden = false;
  navigation.classList.add("js-collapsible");

  function closeMenu(returnFocus = false) {
    const focusWasInside = navigation.contains(document.activeElement);
    menuButton.setAttribute("aria-expanded", "false");
    navigation.classList.remove("is-open");
    if (returnFocus && focusWasInside) {
      menuButton.focus();
    }
  }

  function toggleMenu() {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    navigation.classList.toggle("is-open", !isOpen);
  }

  menuButton.addEventListener("click", toggleMenu);

  navigation.addEventListener("click", event => {
    const targetLink = event.target.closest("a");
    if (!targetLink) return;
    closeMenu();

    const targetSection = document.querySelector(targetLink.getAttribute("href"));
    if (targetSection) {
      targetSection.setAttribute("tabindex", "-1");
      targetSection.focus({ preventScroll: true });
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") {
      closeMenu(true);
    }
  });

  document.addEventListener("click", event => {
    if (!navigation.contains(event.target) && !menuButton.contains(event.target)) {
      if (menuButton.getAttribute("aria-expanded") === "true") {
        closeMenu(false);
      }
    }
  });

  const desktopQuery = window.matchMedia("(min-width: 841px)");
  desktopQuery.addEventListener("change", e => {
    if (e.matches) closeMenu();
  });
}

/* --------------------------------------------------------------------------
   4. Category Filters Controller & Project Visuals Cache
   -------------------------------------------------------------------------- */
let activeFilter = "all";
const projectGrid = document.getElementById("project-grid");
const filterStatus = document.getElementById("filter-status");

// Capture handcrafted initial visuals from static DOM (Nova 3D workspace, Video Timeline, Network Topology)
const initialProjectVisuals = {};
document.querySelectorAll(".project-card").forEach((card, idx) => {
  const visualEl = card.querySelector(".project-visual");
  if (visualEl) {
    initialProjectVisuals[idx] = visualEl.outerHTML;
  }
});

function bindFilterTabs() {
  const filterTabs = document.querySelectorAll(".filter-tab");
  const projectCards = document.querySelectorAll(".project-card");

  filterTabs.forEach(tab => {
    tab.onclick = () => {
      const category = tab.dataset.filter || "all";
      activeFilter = category;

      filterTabs.forEach(t => {
        const isMatch = (t.dataset.filter || "all") === activeFilter;
        t.classList.toggle("active", isMatch);
        t.setAttribute("aria-selected", String(isMatch));
      });

      let visibleCount = 0;
      projectCards.forEach(card => {
        const matches = activeFilter === "all" || card.dataset.category === activeFilter;
        card.hidden = !matches;
        if (matches) visibleCount++;
      });

      if (projectGrid) {
        projectGrid.classList.toggle("is-filtered", activeFilter !== "all");
      }

      if (filterStatus) {
        const categoryName = activeFilter === "all" ? "all specialties" : tab.textContent.replace(/\d+\s*\/\s*/g, "").trim().toLowerCase();
        filterStatus.textContent = `Showing ${visibleCount} project${visibleCount === 1 ? "" : "s"}: ${categoryName}.`;
      }
    };
  });

  // Re-apply current active filter to cards
  let visibleCount = 0;
  projectCards.forEach(card => {
    const matches = activeFilter === "all" || card.dataset.category === activeFilter;
    card.hidden = !matches;
    if (matches) visibleCount++;
  });

  if (projectGrid) {
    projectGrid.classList.toggle("is-filtered", activeFilter !== "all");
  }
}

bindFilterTabs();

/* --------------------------------------------------------------------------
   5. Dynamic CMS Content Fetch & Rendering
   -------------------------------------------------------------------------- */
async function loadDynamicContent() {
  try {
    let res = null;
    // 1. First attempt: cache-busted content.json (immediate on GitHub Pages & static hosts)
    try {
      res = await fetch(`./content.json?_t=${Date.now()}`);
    } catch (_) {}

    // 2. Second attempt: local Python API endpoint if running server.py
    if (!res || !res.ok) {
      try {
        res = await fetch("/api/content");
      } catch (_) {}
    }

    if (!res || !res.ok) return;
    const data = await res.json();
    if (!data.success) return;

    // Update Profile
    if (data.profile) {
      Object.assign(portfolio, data.profile);
      updateProfileDOM();
    }

    // Update Capabilities (if updated in CMS)
    if (Array.isArray(data.capabilities) && data.capabilities.length >= 3) {
      const capCards = document.querySelectorAll(".capability");
      data.capabilities.slice(0, 3).forEach((cap, idx) => {
        const card = capCards[idx];
        if (card) {
          const h3 = card.querySelector("h3");
          const p = card.querySelector("p");
          if (h3 && cap.title) h3.textContent = cap.title;
          if (p && cap.description) p.textContent = cap.description;
        }
      });
    }

    // Render dynamic projects if available
    if (Array.isArray(data.projects) && data.projects.length > 0) {
      renderProjects(data.projects);
    }
  } catch (err) {
    console.log("Using static portfolio data:", err);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderProjects(projects) {
  if (!projectGrid) return;

  // Filter only published projects (is_published !== 0 and !== false)
  const publishedProjects = projects.filter(p => p.is_published !== 0 && p.is_published !== false);
  if (publishedProjects.length === 0) return;

  // Adjust grid layout when more than 3 projects exist
  projectGrid.classList.toggle("has-more-projects", publishedProjects.length > 3);

  projectGrid.innerHTML = publishedProjects.map((p, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    const isDev = p.category === "development" && idx === 0 && publishedProjects.length <= 3;

    // Visual Media Element
    let mediaHtml = "";
    if (p.video_url && (p.video_url.endsWith(".mp4") || p.video_url.endsWith(".webm") || p.video_url.endsWith(".mov"))) {
      mediaHtml = `
        <div class="project-visual video-visual" style="height: 220px; padding:0; overflow:hidden; border-radius:10px;">
          <video src="${escapeHtml(p.video_url)}" controls style="width:100%; height:100%; object-fit:cover;"></video>
        </div>
      `;
    } else if (p.thumbnail && p.thumbnail !== "assets/mountain-preview.jpg") {
      mediaHtml = `
        <div class="project-visual video-visual" style="padding:0; overflow:hidden; border-radius:10px;">
          <div class="video-preview-frame full-radius" style="position:relative; width:100%; height:240px;">
            <img src="${escapeHtml(p.thumbnail)}" alt="${escapeHtml(p.title)}" style="width:100%; height:100%; object-fit:cover;" loading="lazy">
            ${p.category === 'video' ? `
              <div class="video-play-disc" aria-label="Play preview">
                <span class="play-triangle">▶</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    } else if (initialProjectVisuals[idx]) {
      // Preserve handcrafted 3D platform / timeline / network diagram
      mediaHtml = initialProjectVisuals[idx];
    } else if (p.thumbnail) {
      mediaHtml = `
        <div class="project-visual video-visual" style="padding:0; overflow:hidden; border-radius:10px;">
          <div class="video-preview-frame full-radius" style="position:relative; width:100%; height:240px;">
            <img src="${escapeHtml(p.thumbnail)}" alt="${escapeHtml(p.title)}" style="width:100%; height:100%; object-fit:cover;" loading="lazy">
          </div>
        </div>
      `;
    } else {
      mediaHtml = `
        <div class="project-visual" style="height: 200px; display:grid; place-items:center; background: linear-gradient(135deg, #e9edf6, #dce2ef); color: var(--accent); font-size: 38px; border-radius: 10px;">
          <span>${p.category === 'video' ? '🎬' : (p.category === 'support' ? '🛠️' : '💻')}</span>
        </div>
      `;
    }

    const tagsHtml = (p.tags || []).map(t => `<span>${escapeHtml(t)}</span>`).join("");

    const linksHtml = `
      ${p.demo_url ? `<a href="${escapeHtml(p.demo_url)}" target="_blank" rel="noopener noreferrer" class="project-live-link">Live Demo ↗</a>` : ''}
      ${p.github_url ? `<a href="${escapeHtml(p.github_url)}" target="_blank" rel="noopener noreferrer" class="project-live-link" style="margin-left: 12px;">GitHub ↗</a>` : ''}
      ${p.video_url && !p.video_url.endsWith(".mp4") && !p.video_url.endsWith(".webm") ? `<a href="${escapeHtml(p.video_url)}" target="_blank" rel="noopener noreferrer" class="project-live-link">Watch Video ↗</a>` : ''}
    `;

    return `
      <article class="project-card ${isDev ? 'development-card' : ''} glass" data-category="${escapeHtml(p.category)}">
        <div class="project-label">
          <span class="concept-badge"><i class="status-dot green"></i> ${p.is_concept ? 'CONCEPT PROJECT' : 'PROJECT'}</span>
          <span class="project-num">${num}</span>
        </div>

        ${mediaHtml}

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
          <a class="card-circle-btn" href="#work" aria-label="${escapeHtml(p.title)} details">
            <span class="circle-btn-arrow" aria-hidden="true">→</span>
          </a>
        </div>
      </article>
    `;
  }).join("");

  bindFilterTabs();
}

// Start dynamic content fetch
loadDynamicContent();

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

    const href = targetLink.getAttribute("href");
    if (href && href.startsWith("#")) {
      try {
        const targetSection = document.querySelector(href);
        if (targetSection) {
          targetSection.setAttribute("tabindex", "-1");
          targetSection.focus({ preventScroll: true });
        }
      } catch (_) {}
    }
  });

  // Desktop dropdown touch & accessibility support
  const dropdownTrigger = document.querySelector(".nav-dropdown-trigger");
  const dropdownMenu = document.querySelector(".nav-dropdown-menu");
  if (dropdownTrigger && dropdownMenu) {
    dropdownTrigger.addEventListener("click", event => {
      if (event.target.closest(".dropdown-chevron") || window.matchMedia("(hover: none)").matches) {
        event.preventDefault();
        const isOpen = dropdownTrigger.getAttribute("aria-expanded") === "true";
        dropdownTrigger.setAttribute("aria-expanded", String(!isOpen));
        dropdownMenu.classList.toggle("is-active", !isOpen);
      }
    });

    document.addEventListener("click", event => {
      if (!dropdownTrigger.contains(event.target) && !dropdownMenu.contains(event.target)) {
        dropdownTrigger.setAttribute("aria-expanded", "false");
        dropdownMenu.classList.remove("is-active");
      }
    });
  }

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
  const filterTabs = document.querySelectorAll("button.filter-tab");
  const projectCards = document.querySelectorAll(".project-card");
  if (filterTabs.length === 0) return;

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

    // Update Featured Preview Counts & Content
    if (Array.isArray(data.projects) && data.projects.length > 0) {
      updateFeaturedPreviews(data.projects);
    }
  } catch (err) {
    console.log("Using static portfolio data:", err);
  }
}

function updateFeaturedPreviews(projects) {
  if (!Array.isArray(projects)) return;
  const published = projects.filter(p => p.is_published !== 0 && p.is_published !== false);

  const devProjects = published.filter(p => p.category === "development");
  const videoProjects = published.filter(p => p.category === "video");
  const supportProjects = published.filter(p => p.category === "support");

  // Update Category Project Counters on Preview Cards
  document.querySelectorAll('[data-cat-count="development"]').forEach(el => el.textContent = `(${devProjects.length})`);
  document.querySelectorAll('[data-cat-count="video"]').forEach(el => el.textContent = `(${videoProjects.length})`);
  document.querySelectorAll('[data-cat-count="support"]').forEach(el => el.textContent = `(${supportProjects.length})`);

  // Sync Featured Preview Card Copy if customized in CMS
  const devCard = document.querySelector('.project-card[data-category="development"]');
  if (devCard && devProjects.length > 0) {
    const h3 = devCard.querySelector("h3");
    const p = devCard.querySelector(".project-copy-main > p");
    if (h3 && devProjects[0].title) h3.textContent = devProjects[0].title;
    if (p && devProjects[0].description) p.textContent = devProjects[0].description;
  }

  const videoCard = document.querySelector('.project-card[data-category="video"]');
  if (videoCard && videoProjects.length > 0) {
    const h3 = videoCard.querySelector("h3");
    const p = videoCard.querySelector(".project-copy-main > p");
    if (h3 && videoProjects[0].title) h3.textContent = videoProjects[0].title;
    if (p && videoProjects[0].description) p.textContent = videoProjects[0].description;
  }

  const supportCard = document.querySelector('.project-card[data-category="support"]');
  if (supportCard && supportProjects.length > 0) {
    const h3 = supportCard.querySelector("h3");
    const p = supportCard.querySelector(".project-copy-main > p");
    if (h3 && supportProjects[0].title) h3.textContent = supportProjects[0].title;
    if (p && supportProjects[0].description) p.textContent = supportProjects[0].description;
  }
}

// Start dynamic content fetch
loadDynamicContent();

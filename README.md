# Personal Portfolio — Programming, Technical Support & Video Editing

A modern, high-performance personal portfolio built with clean semantic HTML5, Vanilla CSS3, and JavaScript, precisely matching the futuristic silver-white and violet visual reference (`design-reference.png`).

---

## Visual Design & Architecture

- **Futuristic Silver-White & Violet Theme:** Dynamic radial silver-white background gradients with vivid electric violet (`#7928ca` / `#9d50ff`) accents, glowing borders, and dark glassmorphic panels (`backdrop-filter: blur(16px)`).
- **Hero Artwork:** Custom 3D orbital core with glowing neon energy rings on a futuristic platform, complemented by floating glass interactive panels:
  - `01 / BUILD`: Code editor panel with syntax highlighting (`// Build const ideas = ...`).
  - `02 / SUPPORT`: High-availability system status checklist with green verification indicators.
  - `03 / EDIT`: Cinematic mountain landscape monitor with centered play button and multi-track NLE editing timeline.
- **Work Section ("Work in orbit."):**
  - `01 / Development`: Tall Nova SaaS workspace card with navigation sidebar, area wave chart, and 4 KPI metrics (`Active Users 1,248`, `Projects 12`, `System Uptime 99.9%`, `Tasks Completed 86`).
  - `02 / Video Editing`: Cinematic landscape preview, 24fps 4K timecode, multi-colored track blocks, and audio waveforms.
  - `03 / Technical Support`: Interactive architectural system diagnostics diagram with endpoint devices, glowing server hub, and cloud infrastructure nodes.
- **Capabilities Section ("Three skills. One workflow."):** 3 cards covering Websites & Applications, Troubleshooting & IT Support, and Video Editing & Storytelling.
- **About Section:** Clean, structured biographical and approach section with clear placeholder indicators.
- **Contact / CTA Banner:** Wide futuristic pill banner ("Ready for what's next?") with large glowing action button and direct email link.
- **Footer:** Brand logo, horizontal divider, email, GitHub, and LinkedIn social links.

---

## Interactive Features & Accessibility

1. **High Contrast Toggle:**
   - Click the "High contrast" button in the navigation header to toggle between the futuristic silver-white theme and a high-contrast dark theme.
   - Saves preferences automatically in `localStorage` and restores them on subsequent visits.
2. **Category Filters:**
   - Tabs: `00 / ALL WORK`, `01 / DEVELOPMENT`, `02 / TECH SUPPORT`, `03 / VIDEO EDITING`.
   - Filters project cards instantly, with animated active indicator and `aria-live` screen-reader announcements.
3. **Responsive Mobile Navigation:**
   - Accessible collapsible menu drawer on tablet and mobile viewports (<840px).
   - Closes automatically on item selection, outside click, or when pressing `Escape`.
4. **Motion & Accessibility:**
   - Supports `prefers-reduced-motion: reduce`, automatically turning off floating animations, transitions, and smooth scrolling for users who prefer reduced motion.
   - Screen-reader skip link (`Skip to content`) and clear keyboard `:focus-visible` rings.

---

## How to Customize Your Details

Open **`script.js`** and modify the `portfolio` object at the top:

```javascript
const portfolio = {
  name: "Your Name",
  email: "hello@example.com",
  location: "[Your city / time zone]",
  bio: "[Your biography: introduce yourself, your background, and what draws you to programming, technical support, and video editing.]",
  approach: "[Your approach: describe how you work, the tools you actually use, and the kinds of projects or roles you would like to explore.]",
  github: "https://github.com/your-username",
  linkedin: "https://www.linkedin.com/in/your-username/",
  projectLinks: {
    development: "https://your-demo-url.com",
    support: "",
    video: ""
  }
};
```

- Any link left empty (`""`) will remain cleanly unconfigured without generating broken dead links.
- Updating `name` automatically updates the navigation brand, About heading, footer brand, and page title.

---

## Local Preview

The web server is currently running locally. You can access it at:

- **Local PC:** [http://127.0.0.1:8000](http://127.0.0.1:8000) or [http://localhost:8000](http://localhost:8000)
- **Local Network / Mobile (Same Wi-Fi):**
  1. Find your local IP by running `hostname -I` in a terminal (e.g. `192.168.1.50`).
  2. Open `http://YOUR-IP:8000` on your mobile browser.

To stop or restart the server in your terminal:
```bash
python3 -m http.server 8000
```

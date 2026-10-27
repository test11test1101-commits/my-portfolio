#!/usr/bin/env python3
"""
Portfolio Self-Hosted CMS Backend & Server
Runs natively on Python 3.12 standard library with SQLite.
Provides public portfolio API, authenticated admin panel, file uploads,
and one-click backup/restore.
"""

import os
import sys
import json
import sqlite3
import hashlib
import secrets
import shutil
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler, ThreadingHTTPServer
from http import cookies
from urllib.parse import urlparse, parse_qs
from email.parser import BytesParser
from email.policy import default as email_policy
import mimetypes

# Base paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "portfolio.db")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")
UPLOADS_IMG_DIR = os.path.join(UPLOADS_DIR, "images")
UPLOADS_VID_DIR = os.path.join(UPLOADS_DIR, "videos")
BACKUPS_DIR = os.path.join(DATA_DIR, "backups")
ADMIN_DIR = os.path.join(BASE_DIR, "admin")

# Ensure required directories exist
for path in [DATA_DIR, UPLOADS_DIR, UPLOADS_IMG_DIR, UPLOADS_VID_DIR, BACKUPS_DIR, ADMIN_DIR]:
    os.makedirs(path, exist_ok=True)

# Security Limits
MAX_IMAGE_SIZE = 12 * 1024 * 1024       # 12 MB
MAX_VIDEO_SIZE = 120 * 1024 * 1024      # 120 MB
SESSION_TTL_SECONDS = 7 * 24 * 3600     # 7 days

ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}
ALLOWED_VIDEO_EXTS = {".mp4", ".webm", ".mov"}


# =============================================================================
# DATABASE LAYER & SEEDING
# =============================================================================

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def hash_password(password: str, salt: bytes = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_bytes(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 600000)
    return hashed.hex(), salt.hex()

def verify_password(password: str, hashed_hex: str, salt_hex: str) -> bool:
    salt = bytes.fromhex(salt_hex)
    test_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 600000).hex()
    return secrets.compare_digest(test_hash, hashed_hex)

def init_db():
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS profile (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            name TEXT NOT NULL DEFAULT 'Your Name',
            headline TEXT NOT NULL DEFAULT 'Build the next.\nKeep it running.\nMake it move.',
            intro TEXT NOT NULL DEFAULT 'Programming, technical support, and video editing — connected by one creative mind.',
            bio TEXT NOT NULL DEFAULT '[Your biography: introduce yourself, your background, and what draws you to programming, technical support, and video editing.]',
            approach TEXT NOT NULL DEFAULT '[Your approach: describe how you work, the tools you actually use, and the kinds of projects or roles you would like to explore.]',
            location TEXT NOT NULL DEFAULT '[Your city / time zone]',
            email TEXT NOT NULL DEFAULT 'hello@example.com',
            github TEXT NOT NULL DEFAULT '',
            linkedin TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS capabilities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_index INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            icon_type TEXT NOT NULL DEFAULT 'code'
        );

        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'development',
            description TEXT NOT NULL,
            detailed_scope TEXT NOT NULL DEFAULT '',
            thumbnail TEXT NOT NULL DEFAULT '',
            gallery_json TEXT NOT NULL DEFAULT '[]',
            video_url TEXT NOT NULL DEFAULT '',
            github_url TEXT NOT NULL DEFAULT '',
            demo_url TEXT NOT NULL DEFAULT '',
            tags_json TEXT NOT NULL DEFAULT '[]',
            is_concept INTEGER NOT NULL DEFAULT 1,
            order_index INTEGER NOT NULL DEFAULT 0,
            is_published INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """)

        # Initialize Default Admin if none exists
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE username = 'admin'")
        if not cursor.fetchone():
            now_iso = datetime.now(timezone.utc).isoformat()
            p_hash, p_salt = hash_password("portfolio-admin-2026")
            conn.execute(
                "INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)",
                ("admin", p_hash, p_salt, now_iso)
            )

        # Seed profile row if empty
        cursor.execute("SELECT id FROM profile WHERE id = 1")
        if not cursor.fetchone():
            now_iso = datetime.now(timezone.utc).isoformat()
            conn.execute("""
            INSERT INTO profile (id, name, headline, intro, bio, approach, location, email, github, linkedin, updated_at)
            VALUES (1, 'Your Name', 'Build the next.\nKeep it running.\nMake it move.',
                    'Programming, technical support, and video editing — connected by one creative mind.',
                    '[Your biography: introduce yourself, your background, and what draws you to programming, technical support, and video editing.]',
                    '[Your approach: describe how you work, the tools you actually use, and the kinds of projects or roles you would like to explore.]',
                    '[Your city / time zone]', 'hello@example.com', '', '', ?)
            """, (now_iso,))

        # Seed capabilities if empty
        cursor.execute("SELECT COUNT(*) as count FROM capabilities")
        if cursor.fetchone()["count"] == 0:
            capabilities_seed = [
                (1, "Websites & applications", "Build modern, responsive websites and web applications with clean, functional design.", "code"),
                (2, "Troubleshooting & IT support", "Diagnose issues, resolve problems, and keep systems running smoothly and securely.", "support"),
                (3, "Video editing & storytelling", "Edit and polish video content into clear, engaging stories for any platform.", "video")
            ]
            conn.executemany(
                "INSERT INTO capabilities (order_index, title, description, icon_type) VALUES (?, ?, ?, ?)",
                capabilities_seed
            )

        # Seed existing concept projects if empty
        cursor.execute("SELECT COUNT(*) as count FROM projects")
        if cursor.fetchone()["count"] == 0:
            now_iso = datetime.now(timezone.utc).isoformat()
            projects_seed = [
                (
                    "Web development",
                    "development",
                    "Modern, responsive web applications with clean, functional design.",
                    "Proposed scope: design and build a modular workspace dashboard with accessible controls, smooth data visualizations, and high responsiveness. Sample concept project created to demonstrate engineering and interface capabilities.",
                    "",
                    json.dumps([]),
                    "",
                    "",
                    "",
                    json.dumps(["HTML / CSS", "JavaScript", "UI Concept", "Responsive"]),
                    1,
                    1,
                    1,
                    now_iso,
                    now_iso
                ),
                (
                    "Video editing",
                    "video",
                    "Cinematic and engaging video content from concept to final cut.",
                    "Proposed scope: craft a narrative arc from raw footage, apply natural color harmonies, balance dynamic audio waveforms, and deliver multi-format exports. Concept demonstration showcasing pacing and editorial polish.",
                    "assets/mountain-preview.jpg",
                    json.dumps([]),
                    "",
                    "",
                    "",
                    json.dumps(["Storytelling", "Color Grading", "Sound Design", "Pacing"]),
                    1,
                    2,
                    1,
                    now_iso,
                    now_iso
                ),
                (
                    "Technical support",
                    "support",
                    "Diagnose, resolve, and keep systems running smoothly.",
                    "Proposed scope: root-cause diagnosis, infrastructure connectivity troubleshooting, SLA-backed issue resolution, and clear technical playbooks. Illustrated concept architecture model.",
                    "",
                    json.dumps([]),
                    "",
                    "",
                    "",
                    json.dumps(["Diagnostics", "Documentation", "IT Support", "Reliability"]),
                    1,
                    3,
                    1,
                    now_iso,
                    now_iso
                )
            ]
            conn.executemany("""
            INSERT INTO projects (
                title, category, description, detailed_scope, thumbnail, gallery_json,
                video_url, github_url, demo_url, tags_json, is_concept, order_index,
                is_published, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, projects_seed)


# =============================================================================
# AUTHENTICATION & SESSION HELPERS
# =============================================================================

# In-memory brute-force protection: IP -> (attempt_count, lock_until_timestamp)
LOGIN_RATE_LIMITS = {}

def is_rate_limited(ip: str) -> bool:
    now = time.time()
    record = LOGIN_RATE_LIMITS.get(ip)
    if not record:
        return False
    attempts, lock_until = record
    if lock_until > now:
        return True
    if now - lock_until > 900:  # Reset after 15 min
        del LOGIN_RATE_LIMITS[ip]
    return False

def record_failed_login(ip: str):
    now = time.time()
    attempts, lock_until = LOGIN_RATE_LIMITS.get(ip, (0, 0))
    attempts += 1
    if attempts >= 5:
        lock_until = now + 900  # Lock for 15 minutes
    LOGIN_RATE_LIMITS[ip] = (attempts, lock_until)

def clear_rate_limit(ip: str):
    LOGIN_RATE_LIMITS.pop(ip, None)

def create_session(user_id: int) -> str:
    token = secrets.token_hex(32)
    expires = time.time() + SESSION_TTL_SECONDS
    expires_iso = datetime.fromtimestamp(expires, timezone.utc).isoformat()
    with get_db() as conn:
        conn.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", (token, user_id, expires_iso))
    return token

def get_session_user(token: str):
    if not token:
        return None
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT users.id, users.username, sessions.expires_at
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token = ?
        """, (token,))
        row = cursor.fetchone()
        if not row:
            return None
        expires = datetime.fromisoformat(row["expires_at"]).timestamp()
        if expires < time.time():
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            return None
        return dict(row)

def delete_session(token: str):
    with get_db() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))

def export_static_content():
    """Exports current database content to content.json for static hosts like GitHub Pages."""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name, headline, intro, bio, approach, location, email, github, linkedin FROM profile WHERE id = 1")
            profile = dict(cursor.fetchone() or {})

            cursor.execute("SELECT id, order_index, title, description, icon_type FROM capabilities ORDER BY order_index ASC, id ASC")
            capabilities = [dict(row) for row in cursor.fetchall()]

            cursor.execute("""
            SELECT id, title, category, description, detailed_scope, thumbnail, gallery_json,
                   video_url, github_url, demo_url, tags_json, is_concept, order_index
            FROM projects
            WHERE is_published = 1
            ORDER BY order_index ASC, id ASC
            """)
            projects = []
            for row in cursor.fetchall():
                p = dict(row)
                p["gallery"] = json.loads(p.pop("gallery_json") or "[]")
                p["tags"] = json.loads(p.pop("tags_json") or "[]")
                projects.append(p)

        export_path = os.path.join(BASE_DIR, "content.json")
        with open(export_path, "w", encoding="utf-8") as f:
            json.dump({
                "success": True,
                "profile": profile,
                "capabilities": capabilities,
                "projects": projects
            }, f, indent=2)
    except Exception as e:
        print(f"Failed to export content.json: {e}")


# =============================================================================
# HTTP REQUEST HANDLER
# =============================================================================

class CMSHandler(BaseHTTPRequestHandler):
    server_version = "PortfolioCMS/1.0"

    def get_client_ip(self):
        # Support X-Forwarded-For if behind Caddy
        forwarded = self.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return self.client_address[0]

    def get_cookie(self, name: str) -> str:
        cookie_header = self.headers.get("Cookie")
        if not cookie_header:
            return ""
        c = cookies.SimpleCookie()
        try:
            c.load(cookie_header)
            return c[name].value if name in c else ""
        except Exception:
            return ""

    def get_authenticated_user(self):
        token = self.get_cookie("portfolio_session")
        return get_session_user(token)

    def send_json(self, data, status=200, set_cookies=None):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        if set_cookies:
            for c in set_cookies:
                self.send_header("Set-Cookie", c)
        self.end_headers()
        self.wfile.write(payload)

    def send_error_json(self, message: str, status=400):
        self.send_json({"error": message, "success": False}, status=status)

    def read_json_body(self):
        content_len = int(self.headers.get("Content-Length", 0))
        if content_len == 0:
            return {}
        if content_len > 10 * 1024 * 1024:  # 10MB limit on JSON
            raise ValueError("Payload too large")
        raw = self.rfile.read(content_len)
        return json.loads(raw.decode("utf-8"))

    # -------------------------------------------------------------------------
    # ROUTING
    # -------------------------------------------------------------------------

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # 1. PUBLIC API
        if path == "/api/content":
            self.handle_get_content()
            return

        # 2. ADMIN APIS
        if path == "/api/admin/check":
            user = self.get_authenticated_user()
            if user:
                self.send_json({"authenticated": True, "username": user["username"]})
            else:
                self.send_json({"authenticated": False}, status=401)
            return

        if path == "/api/admin/data":
            user = self.get_authenticated_user()
            if not user:
                self.send_error_json("Unauthorized", 401)
                return
            self.handle_get_admin_data()
            return

        if path == "/api/admin/backup":
            user = self.get_authenticated_user()
            if not user:
                self.send_error_json("Unauthorized", 401)
                return
            self.handle_download_backup()
            return

        # 3. STATIC FILES & ADMIN DASHBOARD
        self.handle_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/login":
            self.handle_login()
            return

        if path == "/api/logout":
            token = self.get_cookie("portfolio_session")
            if token:
                delete_session(token)
            cookie_clear = "portfolio_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax"
            self.send_json({"success": True}, set_cookies=[cookie_clear])
            return

        # Protected routes below
        user = self.get_authenticated_user()
        if not user:
            self.send_error_json("Unauthorized", 401)
            return

        if path == "/api/admin/password":
            self.handle_change_password(user["id"])
            return

        if path == "/api/admin/projects":
            self.handle_create_project()
            return

        if path == "/api/admin/upload":
            self.handle_upload_file()
            return

        if path == "/api/admin/restore":
            self.handle_restore_backup()
            return

        self.send_error_json("Endpoint not found", 404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path

        user = self.get_authenticated_user()
        if not user:
            self.send_error_json("Unauthorized", 401)
            return

        if path == "/api/admin/profile":
            self.handle_update_profile()
            return

        if path == "/api/admin/capabilities":
            self.handle_update_capabilities()
            return

        if path.startswith("/api/admin/projects/"):
            parts = path.strip("/").split("/")
            if len(parts) == 4 and parts[3] == "reorder":
                self.handle_reorder_projects()
                return
            if len(parts) == 4:
                project_id = int(parts[3])
                self.handle_update_project(project_id)
                return

        self.send_error_json("Endpoint not found", 404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        user = self.get_authenticated_user()
        if not user:
            self.send_error_json("Unauthorized", 401)
            return

        if path.startswith("/api/admin/projects/"):
            parts = path.strip("/").split("/")
            if len(parts) == 4:
                project_id = int(parts[3])
                self.handle_delete_project(project_id)
                return

        self.send_error_json("Endpoint not found", 404)

    # -------------------------------------------------------------------------
    # API HANDLERS
    # -------------------------------------------------------------------------

    def handle_login(self):
        ip = self.get_client_ip()
        if is_rate_limited(ip):
            self.send_error_json("Too many failed attempts. Please try again in 15 minutes.", 429)
            return

        try:
            body = self.read_json_body()
            username = body.get("username", "").strip()
            password = body.get("password", "")
        except Exception:
            self.send_error_json("Invalid JSON request", 400)
            return

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, username, password_hash, salt FROM users WHERE username = ?", (username,))
            user = cursor.fetchone()

        if user and verify_password(password, user["password_hash"], user["salt"]):
            clear_rate_limit(ip)
            token = create_session(user["id"])
            cookie_str = f"portfolio_session={token}; Path=/; Max-Age={SESSION_TTL_SECONDS}; HttpOnly; SameSite=Lax"
            self.send_json({"success": True, "username": user["username"]}, set_cookies=[cookie_str])
        else:
            record_failed_login(ip)
            self.send_error_json("Invalid username or password", 401)

    def handle_change_password(self, user_id: int):
        try:
            body = self.read_json_body()
            current_pass = body.get("current_password", "")
            new_pass = body.get("new_password", "")
        except Exception:
            self.send_error_json("Invalid request", 400)
            return

        if len(new_pass) < 8:
            self.send_error_json("New password must be at least 8 characters long", 400)
            return

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT password_hash, salt FROM users WHERE id = ?", (user_id,))
            user = cursor.fetchone()
            if not user or not verify_password(current_pass, user["password_hash"], user["salt"]):
                self.send_error_json("Current password is incorrect", 400)
                return

            new_hash, new_salt = hash_password(new_pass)
            conn.execute("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", (new_hash, new_salt, user_id))

        self.send_json({"success": True, "message": "Password updated successfully"})

    def handle_get_content(self):
        """Public API returning published profile, capabilities, and projects."""
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name, headline, intro, bio, approach, location, email, github, linkedin FROM profile WHERE id = 1")
            profile = dict(cursor.fetchone() or {})

            cursor.execute("SELECT id, order_index, title, description, icon_type FROM capabilities ORDER BY order_index ASC, id ASC")
            capabilities = [dict(row) for row in cursor.fetchall()]

            cursor.execute("""
            SELECT id, title, category, description, detailed_scope, thumbnail, gallery_json,
                   video_url, github_url, demo_url, tags_json, is_concept, order_index
            FROM projects
            WHERE is_published = 1
            ORDER BY order_index ASC, id ASC
            """)
            projects = []
            for row in cursor.fetchall():
                p = dict(row)
                p["gallery"] = json.loads(p.pop("gallery_json") or "[]")
                p["tags"] = json.loads(p.pop("tags_json") or "[]")
                projects.append(p)

        self.send_json({
            "success": True,
            "profile": profile,
            "capabilities": capabilities,
            "projects": projects
        })

    def handle_get_admin_data(self):
        """Full data for admin panel."""
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM profile WHERE id = 1")
            profile = dict(cursor.fetchone() or {})

            cursor.execute("SELECT * FROM capabilities ORDER BY order_index ASC, id ASC")
            capabilities = [dict(row) for row in cursor.fetchall()]

            cursor.execute("SELECT * FROM projects ORDER BY order_index ASC, id ASC")
            projects = []
            for row in cursor.fetchall():
                p = dict(row)
                p["gallery"] = json.loads(p.pop("gallery_json") or "[]")
                p["tags"] = json.loads(p.pop("tags_json") or "[]")
                projects.append(p)

        self.send_json({
            "success": True,
            "profile": profile,
            "capabilities": capabilities,
            "projects": projects
        })

    def handle_update_profile(self):
        body = self.read_json_body()
        fields = ["name", "headline", "intro", "bio", "approach", "location", "email", "github", "linkedin"]
        updates = {k: body.get(k, "").strip() for k in fields if k in body}
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values())

        with get_db() as conn:
            conn.execute(f"UPDATE profile SET {set_clause} WHERE id = 1", values)

        export_static_content()
        self.send_json({"success": True, "message": "Profile saved successfully"})

    def handle_update_capabilities(self):
        body = self.read_json_body()
        items = body.get("capabilities", [])
        if not isinstance(items, list):
            self.send_error_json("Capabilities must be a list", 400)
            return

        with get_db() as conn:
            conn.execute("DELETE FROM capabilities")
            for idx, item in enumerate(items, start=1):
                conn.execute(
                    "INSERT INTO capabilities (order_index, title, description, icon_type) VALUES (?, ?, ?, ?)",
                    (idx, item.get("title", ""), item.get("description", ""), item.get("icon_type", "code"))
                )

        export_static_content()
        self.send_json({"success": True, "message": "Capabilities saved"})

    def handle_create_project(self):
        body = self.read_json_body()
        title = body.get("title", "").strip()
        if not title:
            self.send_error_json("Project title is required", 400)
            return

        now_iso = datetime.now(timezone.utc).isoformat()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COALESCE(MAX(order_index), 0) + 1 AS next_idx FROM projects")
            next_idx = cursor.fetchone()["next_idx"]

            cursor.execute("""
            INSERT INTO projects (
                title, category, description, detailed_scope, thumbnail, gallery_json,
                video_url, github_url, demo_url, tags_json, is_concept, order_index,
                is_published, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                title,
                body.get("category", "development"),
                body.get("description", ""),
                body.get("detailed_scope", ""),
                body.get("thumbnail", ""),
                json.dumps(body.get("gallery", [])),
                body.get("video_url", ""),
                body.get("github_url", ""),
                body.get("demo_url", ""),
                json.dumps(body.get("tags", [])),
                1 if body.get("is_concept", True) else 0,
                next_idx,
                1 if body.get("is_published", True) else 0,
                now_iso,
                now_iso
            ))
            new_id = cursor.lastrowid

        export_static_content()
        self.send_json({"success": True, "id": new_id, "message": "Project created"})

    def handle_update_project(self, project_id: int):
        body = self.read_json_body()
        now_iso = datetime.now(timezone.utc).isoformat()

        fields = {
            "title": body.get("title"),
            "category": body.get("category"),
            "description": body.get("description"),
            "detailed_scope": body.get("detailed_scope"),
            "thumbnail": body.get("thumbnail"),
            "gallery_json": json.dumps(body.get("gallery", [])) if "gallery" in body else None,
            "video_url": body.get("video_url"),
            "github_url": body.get("github_url"),
            "demo_url": body.get("demo_url"),
            "tags_json": json.dumps(body.get("tags", [])) if "tags" in body else None,
            "is_concept": (1 if body.get("is_concept") else 0) if "is_concept" in body else None,
            "is_published": (1 if body.get("is_published") else 0) if "is_published" in body else None,
            "updated_at": now_iso
        }
        # Filter None
        updates = {k: v for k, v in fields.items() if v is not None}
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [project_id]

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(f"UPDATE projects SET {set_clause} WHERE id = ?", values)
            if cursor.rowcount == 0:
                self.send_error_json("Project not found", 404)
                return

        export_static_content()
        self.send_json({"success": True, "message": "Project updated"})

    def handle_delete_project(self, project_id: int):
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            if cursor.rowcount == 0:
                self.send_error_json("Project not found", 404)
                return

        export_static_content()
        self.send_json({"success": True, "message": "Project deleted"})

    def handle_reorder_projects(self):
        body = self.read_json_body()
        order_ids = body.get("order", [])
        if not isinstance(order_ids, list):
            self.send_error_json("Order must be a list of IDs", 400)
            return

        with get_db() as conn:
            for idx, pid in enumerate(order_ids, start=1):
                conn.execute("UPDATE projects SET order_index = ? WHERE id = ?", (idx, pid))

        export_static_content()
        self.send_json({"success": True, "message": "Projects reordered"})

    # -------------------------------------------------------------------------
    # UPLOAD & VALIDATION HANDLER
    # -------------------------------------------------------------------------

    def handle_upload_file(self):
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            self.send_error_json("Content-Type must be multipart/form-data", 400)
            return

        content_len = int(self.headers.get("Content-Length", 0))
        if content_len > MAX_VIDEO_SIZE:
            self.send_error_json("File exceeds maximum allowed size (120MB)", 400)
            return

        body_bytes = self.rfile.read(content_len)
        fake_email_bytes = f"Content-Type: {content_type}\r\n\r\n".encode("utf-8") + body_bytes
        msg = BytesParser(policy=email_policy).parsebytes(fake_email_bytes)

        file_payload = None
        orig_filename = ""
        part_content_type = ""

        for part in msg.iter_parts():
            cd = part.get_param("name", header="content-disposition")
            if cd == "file":
                orig_filename = part.get_filename() or "upload"
                file_payload = part.get_payload(decode=True)
                part_content_type = part.get_content_type()
                break

        if not file_payload:
            self.send_error_json("No file field provided in form", 400)
            return

        ext = os.path.splitext(orig_filename)[1].lower()
        if not ext and part_content_type:
            ext = mimetypes.guess_extension(part_content_type) or ""

        # Validate Image vs Video
        is_image = ext in ALLOWED_IMAGE_EXTS
        is_video = ext in ALLOWED_VIDEO_EXTS

        if not (is_image or is_video):
            self.send_error_json(f"Unsupported file extension '{ext}'. Allowed: {', '.join(ALLOWED_IMAGE_EXTS | ALLOWED_VIDEO_EXTS)}", 400)
            return

        if is_image and len(file_payload) > MAX_IMAGE_SIZE:
            self.send_error_json(f"Image exceeds max size of 12MB ({len(file_payload)/(1024*1024):.1f}MB)", 400)
            return

        if is_video and len(file_payload) > MAX_VIDEO_SIZE:
            self.send_error_json(f"Video exceeds max size of 120MB ({len(file_payload)/(1024*1024):.1f}MB)", 400)
            return

        # Basic magic bytes sanity check
        if is_image:
            if ext in [".jpg", ".jpeg"] and not file_payload.startswith(b"\xff\xd8\xff"):
                self.send_error_json("Invalid JPEG header", 400)
                return
            if ext == ".png" and not file_payload.startswith(b"\x89PNG\r\n\x1a\n"):
                self.send_error_json("Invalid PNG header", 400)
                return
            if ext == ".gif" and not (file_payload.startswith(b"GIF87a") or file_payload.startswith(b"GIF89a")):
                self.send_error_json("Invalid GIF header", 400)
                return
            if ext == ".webp" and not (file_payload.startswith(b"RIFF") and b"WEBP" in file_payload[:16]):
                self.send_error_json("Invalid WebP header", 400)
                return

        # Generate safe random filename
        unique_name = f"{secrets.token_hex(16)}{ext}"
        if is_image:
            target_path = os.path.join(UPLOADS_IMG_DIR, unique_name)
            public_url = f"/uploads/images/{unique_name}"
        else:
            target_path = os.path.join(UPLOADS_VID_DIR, unique_name)
            public_url = f"/uploads/videos/{unique_name}"

        with open(target_path, "wb") as f:
            f.write(file_payload)

        self.send_json({
            "success": True,
            "url": public_url,
            "filename": orig_filename,
            "size": len(file_payload),
            "type": "video" if is_video else "image"
        })

    # -------------------------------------------------------------------------
    # BACKUP & RESTORE HANDLERS
    # -------------------------------------------------------------------------

    def handle_download_backup(self):
        """Creates a .tar.gz archive of portfolio.db and data/uploads and streams it."""
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        backup_filename = f"portfolio-backup-{timestamp}.tar.gz"

        with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp_tar:
            tmp_tar_path = tmp_tar.name

        try:
            # 1. Take a safe hot backup of SQLite database to a temp file
            with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp_db:
                tmp_db_path = tmp_db.name

            with get_db() as source_db, sqlite3.connect(tmp_db_path) as dest_db:
                source_db.backup(dest_db)

            # 2. Package into tar.gz
            with tarfile.open(tmp_tar_path, "w:gz") as tar:
                tar.add(tmp_db_path, arcname="portfolio.db")
                if os.path.exists(UPLOADS_DIR):
                    tar.add(UPLOADS_DIR, arcname="uploads")

            # 3. Read and send
            with open(tmp_tar_path, "rb") as f:
                content = f.read()

            self.send_response(200)
            self.send_header("Content-Type", "application/gzip")
            self.send_header("Content-Disposition", f'attachment; filename="{backup_filename}"')
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(content)

        finally:
            if os.path.exists(tmp_tar_path):
                os.remove(tmp_tar_path)
            if 'tmp_db_path' in locals() and os.path.exists(tmp_db_path):
                os.remove(tmp_db_path)

    def handle_restore_backup(self):
        """Restores database and uploads from an uploaded .tar.gz backup."""
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            self.send_error_json("Content-Type must be multipart/form-data", 400)
            return

        content_len = int(self.headers.get("Content-Length", 0))
        if content_len > 250 * 1024 * 1024:  # 250MB limit
            self.send_error_json("Backup file too large (max 250MB)", 400)
            return

        body_bytes = self.rfile.read(content_len)
        fake_email_bytes = f"Content-Type: {content_type}\r\n\r\n".encode("utf-8") + body_bytes
        msg = BytesParser(policy=email_policy).parsebytes(fake_email_bytes)

        file_payload = None
        for part in msg.iter_parts():
            if part.get_param("name", header="content-disposition") == "backup_file":
                file_payload = part.get_payload(decode=True)
                break

        if not file_payload:
            self.send_error_json("No backup file provided in 'backup_file' field", 400)
            return

        with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp_file:
            tmp_path = tmp_file.name
            tmp_file.write(file_payload)

        extract_dir = tempfile.mkdtemp()
        try:
            with tarfile.open(tmp_path, "r:gz") as tar:
                # Security check against tar slip
                for member in tar.getmembers():
                    if member.name.startswith("/") or ".." in member.name:
                        raise ValueError("Malicious archive member path detected")
                tar.extractall(extract_dir)

            restored_db = os.path.join(extract_dir, "portfolio.db")
            if not os.path.exists(restored_db):
                self.send_error_json("Archive does not contain 'portfolio.db'", 400)
                return

            # Verify SQLite file integrity
            test_conn = sqlite3.connect(restored_db)
            test_cur = test_conn.cursor()
            test_cur.execute("PRAGMA integrity_check")
            check = test_cur.fetchone()
            test_conn.close()
            if not check or check[0] != "ok":
                self.send_error_json("Restored database failed integrity check", 400)
                return

            # Replace live DB
            shutil.copy2(restored_db, DB_PATH)

            # Restore uploads if present
            restored_uploads = os.path.join(extract_dir, "uploads")
            if os.path.exists(restored_uploads):
                for sub in ["images", "videos"]:
                    src_sub = os.path.join(restored_uploads, sub)
                    dst_sub = os.path.join(UPLOADS_DIR, sub)
                    if os.path.exists(src_sub):
                        os.makedirs(dst_sub, exist_ok=True)
                        for item in os.listdir(src_sub):
                            src_item = os.path.join(src_sub, item)
                            dst_item = os.path.join(dst_sub, item)
                            if os.path.isfile(src_item):
                                shutil.copy2(src_item, dst_item)

            self.send_json({"success": True, "message": "Backup restored successfully!"})

        except Exception as e:
            self.send_error_json(f"Restore failed: {str(e)}", 500)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            shutil.rmtree(extract_dir, ignore_errors=True)

    # -------------------------------------------------------------------------
    # STATIC FILE SERVING WITH SECURITY ISOLATION
    # -------------------------------------------------------------------------

    def handle_static(self, path: str):
        # 1. Block access to private data, databases, and backups
        normalized = os.path.normpath(path).lower()
        if (
            "portfolio.db" in normalized or
            normalized.endswith(".db") or
            normalized.endswith(".sqlite") or
            normalized.endswith(".tar.gz") or
            "/data/backups" in normalized or
            "/data/" in normalized and not "/uploads/" in normalized
        ):
            self.send_response(403)
            self.end_headers()
            self.wfile.write(b"403 Forbidden: Access to database, backups, or internal data is prohibited.\n")
            return

        # 2. Map routes to filesystem
        if path == "/" or path == "":
            disk_path = os.path.join(BASE_DIR, "index.html")
        elif path == "/admin" or path == "/admin/":
            disk_path = os.path.join(ADMIN_DIR, "index.html")
        elif path.startswith("/admin/"):
            rel_path = path[len("/admin/"):]
            disk_path = os.path.join(ADMIN_DIR, rel_path)
        elif path.startswith("/uploads/"):
            rel_path = path[len("/uploads/"):]
            disk_path = os.path.join(UPLOADS_DIR, rel_path)
        else:
            rel_path = path.lstrip("/")
            disk_path = os.path.join(BASE_DIR, rel_path)

        # Path traversal guard
        disk_path = os.path.abspath(disk_path)
        allowed_roots = [BASE_DIR, UPLOADS_DIR, ADMIN_DIR]
        if not any(os.path.commonpath([disk_path, root]) == root for root in allowed_roots):
            self.send_response(403)
            self.end_headers()
            return

        if not os.path.exists(disk_path) or os.path.isdir(disk_path):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Not Found\n")
            return

        # Serve static file with headers
        mime, _ = mimetypes.guess_type(disk_path)
        if not mime:
            if disk_path.endswith(".css"):
                mime = "text/css"
            elif disk_path.endswith(".js"):
                mime = "application/javascript"
            elif disk_path.endswith(".svg"):
                mime = "image/svg+xml"
            else:
                mime = "application/octet-stream"

        try:
            stat_info = os.stat(disk_path)
            with open(disk_path, "rb") as f:
                content = f.read()

            self.send_response(200)
            self.send_header("Content-Type", f"{mime}; charset=utf-8" if "text" in mime or "json" in mime or "javascript" in mime else mime)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("X-Content-Type-Options", "nosniff")
            if "/uploads/" in path or "/assets/" in path:
                self.send_header("Cache-Control", "public, max-age=86400")
            else:
                self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode("utf-8"))


# =============================================================================
# CLI & SERVER ENTRY POINT
# =============================================================================

def run_server(port=8000, host="0.0.0.0"):
    init_db()
    server_address = (host, port)
    httpd = ThreadingHTTPServer(server_address, CMSHandler)
    print(f"=========================================================")
    print(f"Portfolio CMS Daemon is running!")
    print(f"Local URL:         http://127.0.0.1:{port}")
    print(f"Admin Dashboard:   http://127.0.0.1:{port}/admin")
    print(f"Default Login:     Username: admin  |  Password: portfolio-admin-2026")
    print(f"Database:          {DB_PATH}")
    print(f"Uploads:           {UPLOADS_DIR}")
    print(f"=========================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8000
    run_server(port=port)

"""
FocusFlow Build Script
Copies the extension to a 'dist' folder with:
  - All JS comments removed
  - All JS whitespace minimized
  - All HTML whitespace minimized
  - Everything else copied as-is (icons, fonts, CSS, manifest, etc.)

Usage:  python build.py
Output: ../focusflow-dist/  (sibling folder next to source)
"""

import os
import re
import shutil
import sys
import json

# --- Config ---
SRC_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(os.path.dirname(SRC_DIR), "focusflow-dist")

# Files/folders to skip copying
SKIP = {"build.py", "node_modules", ".git", ".gitignore", "__pycache__"}


def strip_js_comments(code):
    """Remove single-line (//) and multi-line (/* */) comments from JS code.
    Preserves strings and regex literals so we don't break URLs like https://..."""
    result = []
    i = 0
    n = len(code)
    while i < n:
        # Single-quoted string
        if code[i] == "'":
            j = i + 1
            while j < n:
                if code[j] == "\\" and j + 1 < n:
                    j += 2
                    continue
                if code[j] == "'":
                    j += 1
                    break
                j += 1
            result.append(code[i:j])
            i = j
        # Double-quoted string
        elif code[i] == '"':
            j = i + 1
            while j < n:
                if code[j] == "\\" and j + 1 < n:
                    j += 2
                    continue
                if code[j] == '"':
                    j += 1
                    break
                j += 1
            result.append(code[i:j])
            i = j
        # Template literal (backtick)
        elif code[i] == '`':
            j = i + 1
            while j < n:
                if code[j] == "\\" and j + 1 < n:
                    j += 2
                    continue
                if code[j] == '`':
                    j += 1
                    break
                j += 1
            result.append(code[i:j])
            i = j
        # Single-line comment
        elif code[i] == '/' and i + 1 < n and code[i + 1] == '/':
            # Skip to end of line
            j = i + 2
            while j < n and code[j] != '\n':
                j += 1
            i = j
        # Multi-line comment
        elif code[i] == '/' and i + 1 < n and code[i + 1] == '*':
            j = i + 2
            while j + 1 < n and not (code[j] == '*' and code[j + 1] == '/'):
                j += 1
            i = j + 2
        # Regular expression literal (basic detection)
        elif code[i] == '/' and i + 1 < n and code[i + 1] not in ('/', '*'):
            # Check if this is likely a regex (preceded by operator or keyword)
            prev_meaningful = ''.join(result).rstrip()
            if prev_meaningful and prev_meaningful[-1] in '=(:,;!&|?[{^~+-><%':
                j = i + 1
                while j < n:
                    if code[j] == "\\" and j + 1 < n:
                        j += 2
                        continue
                    if code[j] == '/':
                        j += 1
                        # Skip flags
                        while j < n and code[j].isalpha():
                            j += 1
                        break
                    if code[j] == '\n':
                        break
                    j += 1
                result.append(code[i:j])
                i = j
            else:
                result.append(code[i])
                i += 1
        else:
            result.append(code[i])
            i += 1
    return ''.join(result)


def collapse_whitespace_js(code):
    """Collapse multiple blank lines into single newlines and trim trailing spaces."""
    lines = code.split('\n')
    out = []
    prev_blank = False
    for line in lines:
        stripped = line.rstrip()
        if stripped == '':
            if not prev_blank:
                out.append('')
            prev_blank = True
        else:
            out.append(stripped)
            prev_blank = False
    # Remove leading/trailing blank lines
    while out and out[0] == '':
        out.pop(0)
    while out and out[-1] == '':
        out.pop()
    return '\n'.join(out)


def minify_html(html):
    """Basic HTML minification: collapse whitespace between tags, remove HTML comments."""
    # Remove HTML comments (but not conditional comments)
    html = re.sub(r'<!--(?!\[).*?-->', '', html, flags=re.DOTALL)
    # Collapse runs of whitespace between tags into a single space
    html = re.sub(r'>\s+<', '> <', html)
    # Collapse multiple spaces/tabs within lines
    lines = html.split('\n')
    out = []
    for line in lines:
        stripped = line.strip()
        if stripped:
            out.append(stripped)
    return '\n'.join(out)


def process_file(src_path, dst_path):
    """Process a single file: minify JS/HTML or copy as-is."""
    ext = os.path.splitext(src_path)[1].lower()

    if ext == '.js':
        with open(src_path, 'r', encoding='utf-8', errors='replace') as f:
            code = f.read()
        original_size = len(code.encode('utf-8'))
        code = strip_js_comments(code)
        code = collapse_whitespace_js(code)
        new_size = len(code.encode('utf-8'))
        with open(dst_path, 'w', encoding='utf-8') as f:
            f.write(code)
        saved = original_size - new_size
        if saved > 100:
            print(f"  JS  {os.path.basename(src_path):30s}  {original_size:>8,} -> {new_size:>8,}  (saved {saved:,} bytes)")
        return original_size, new_size

    elif ext in ('.html', '.htm'):
        with open(src_path, 'r', encoding='utf-8', errors='replace') as f:
            html = f.read()
        original_size = len(html.encode('utf-8'))
        html = minify_html(html)
        new_size = len(html.encode('utf-8'))
        with open(dst_path, 'w', encoding='utf-8') as f:
            f.write(html)
        saved = original_size - new_size
        if saved > 100:
            print(f"  HTML {os.path.basename(src_path):30s} {original_size:>8,} -> {new_size:>8,}  (saved {saved:,} bytes)")
        return original_size, new_size

    else:
        shutil.copy2(src_path, dst_path)
        size = os.path.getsize(src_path)
        return size, size


def build_target(target_name, is_firefox=False):
    target_dir = os.path.join(os.path.dirname(SRC_DIR), target_name)
    print("=" * 60)
    print(f"  FocusFlow Build: {target_name}")
    print("=" * 60)
    print(f"\n  Source:  {SRC_DIR}")
    print(f"  Output:  {target_dir}\n")

    # Clean old dist
    if os.path.exists(target_dir):
        shutil.rmtree(target_dir)
        print(f"  Cleaned old {target_name} folder.\n")

    total_original = 0
    total_new = 0
    file_count = 0

    for root, dirs, files in os.walk(SRC_DIR):
        # Skip unwanted directories
        dirs[:] = [d for d in dirs if d not in SKIP]

        rel_dir = os.path.relpath(root, SRC_DIR)
        dst_dir = os.path.join(target_dir, rel_dir) if rel_dir != '.' else target_dir

        os.makedirs(dst_dir, exist_ok=True)

        for fname in files:
            if fname in SKIP:
                continue
            src_path = os.path.join(root, fname)
            dst_path = os.path.join(dst_dir, fname)
            orig, new = process_file(src_path, dst_path)
            
            # Apply Firefox-specific tweaks to manifest.json
            if is_firefox and fname == "manifest.json" and root == SRC_DIR:
                with open(dst_path, 'r', encoding='utf-8') as f:
                    manifest = json.load(f)
                
                # Convert service_worker to scripts array and include its dependencies
                if "background" in manifest and "service_worker" in manifest["background"]:
                    manifest["background"]["scripts"] = [
                        "src/lib/constants.js",
                        "src/lib/storage.js",
                        "src/lib/db.js",
                        manifest["background"]["service_worker"]
                    ]
                    del manifest["background"]["service_worker"]
                
                # Add Gecko ID and Telemetry declaration
                manifest["browser_specific_settings"] = {
                    "gecko": {
                        "id": "focusflow@prime-vsr-cloud",
                        "data_collection_permissions": {
                            "required": ["none"]
                        }
                    }
                }
                
                # Remove Firefox-unsupported 'favicon' permission
                if "permissions" in manifest and "favicon" in manifest["permissions"]:
                    manifest["permissions"].remove("favicon")
                
                with open(dst_path, 'w', encoding='utf-8') as f:
                    json.dump(manifest, f, indent=2)
                
                print(f"  [Firefox] Tweaked manifest.json for Gecko compatibility")

            total_original += orig
            total_new += new
            file_count += 1

    saved = total_original - total_new
    print(f"\n{'=' * 60}")
    print(f"  Done! {file_count} files processed.")
    print(f"  Total:  {total_original:>10,} bytes  ->  {total_new:>10,} bytes")
    if total_original > 0:
        print(f"  Saved:  {saved:>10,} bytes  ({saved * 100 // total_original}%)")
    print(f"  Output: {target_dir}")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    build_target("focusflow-dist", is_firefox=False)
    build_target("focusflow-firefox", is_firefox=True)

#!/bin/bash

# Define paths
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPML_FILE="$REPO_DIR/all-feeds.opml"
SUBS_FILE="$REPO_DIR/SUBSCRIPTIONS.md"
README_FILE="$REPO_DIR/README.md"

echo "🔄 Syncing NetNewsWire (iCloud) to Personal-RSS Repo..."

# 1. Export OPML from NetNewsWire (Safely)
# Uses a temp file to prevent overwriting valid data with empty output if export fails.
OPML_TEMP=$(mktemp)

osascript -e '
tell application "NetNewsWire"
    set opmlContent to opml string of account "iCloud"
    return opmlContent
end tell' > "$OPML_TEMP" 2>/dev/null

if [ $? -eq 0 ] && [ -s "$OPML_TEMP" ]; then
    mv "$OPML_TEMP" "$OPML_FILE"
    echo "✅ Exported OPML successfully."
else
    rm -f "$OPML_TEMP"
    echo "⚠️  Auto-export failed (likely permission/scripting issue). Keeping existing OPML."
fi

# 2. Update Documentation (SUBSCRIPTIONS.md & README.md)
echo "📄 Updating documentation..."

python3 -c '
import xml.etree.ElementTree as ET
import sys
import os

opml_path = "'"$OPML_FILE"'"
subs_md_path = "'"$SUBS_FILE"'"
readme_path = "'"$README_FILE"'"

def generate_markdown(opml_file):
    try:
        tree = ET.parse(opml_file)
        root = tree.getroot()
        body = root.find("body")
        
        md_lines = []
        md_lines.append("| Feed | URL |")
        md_lines.append("|------|-----|")
        
        def process(element):
            if list(element): # Category
                title = element.get("text") or element.get("title")
                if title: 
                    md_lines.append(f"| **{title}** | |")
                for child in element: process(child)
            elif element.get("xmlUrl"):
                title = element.get("text") or element.get("title") or "Untitled"
                html = element.get("htmlUrl") or ""
                xml = element.get("xmlUrl")
                title_cell = f"[{title}]({html})" if html else title
                md_lines.append(f"| {title_cell} | [RSS]({xml}) |")

        for child in body: process(child)
        return "\n".join(md_lines)
        
    except Exception as e:
        print(f"Error parsing OPML: {e}", file=sys.stderr)
        return None

# Generate Table Content
table_content = generate_markdown(opml_path)

if table_content:
    # Update SUBSCRIPTIONS.md (Full File)
    with open(subs_md_path, "w") as f:
        f.write("# My Subscriptions\n\nAutomated list of feeds.\n\n")
        f.write(table_content)
    print(f"✅ Updated {os.path.basename(subs_md_path)}")

    # Update README.md (Injection)
    try:
        with open(readme_path, "r") as f:
            content = f.read()
        
        start_marker = "<!-- START_SUBS_LIST -->"
        end_marker = "<!-- END_SUBS_LIST -->"
        
        if start_marker in content and end_marker in content:
            pre = content.split(start_marker)[0]
            post = content.split(end_marker)[1]
            
            wrapped_table = (
                f"{start_marker}\n"
                "<details>\n"
                "<summary><strong>Click to view full subscription list</strong></summary>\n\n"
                f"{table_content}\n"
                "</details>\n"
                f"{end_marker}"
            )
            
            new_content = pre + wrapped_table + post
            
            with open(readme_path, "w") as f:
                f.write(new_content)
            print(f"✅ Updated {os.path.basename(readme_path)}")
        else:
            print(f"⚠️ Markers not found in README.md. Skipping injection.")
            
    except Exception as e:
        print(f"Error updating README: {e}", file=sys.stderr)
'

# 3. Git Commit (Optional)
# Uncomment to enable auto-commit
# cd "$REPO_DIR"
# if [[ -n $(git status -s) ]]; then
#    git add .
#    git commit -m "Update RSS subscriptions"
#    echo "💾 Committed changes."
# fi

echo "🎉 Done!"

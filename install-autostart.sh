#!/bin/bash
# Install the on-demand bridge: macOS holds localhost:3055 and starts the bridge (and Claude Code) only when the
# Figma plugin connects; it exits after 10 idle minutes with no plugin open. Re-run to update; uninstall with
# uninstall-autostart.sh.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"

# Team rules: --rules DIR points at your team's rules folder (e.g. a clone of its private rules repo).
# The choice is remembered; without it a previous choice is kept, else ./team-rules, else the generic example.
RULES=""
while [ $# -gt 0 ]; do
  case "$1" in
    --rules) RULES="${2:-}"; shift 2 ;;
    --rules=*) RULES="${1#--rules=}"; shift ;;
    *) echo "Unknown option: $1 (use --rules DIR)"; exit 1 ;;
  esac
done
if [ -n "$RULES" ]; then
  [ -d "$RULES" ] || { echo "Rules folder not found: $RULES"; exit 1; }
  RULES="$(cd "$RULES" && pwd)"
fi
USER_HOME="$(dscl . -read "/Users/$(id -un)" NFSHomeDirectory | awk '{print $2}')"
DEST="$USER_HOME/Library/Application Support/FigmaAgent"
LABEL="com.figma-agent.bridge"
PLIST="$USER_HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$USER_HOME/Library/Logs/figma-agent.log"
CLAUDE_BIN="$(command -v claude || echo "$USER_HOME/.local/bin/claude")"
PORT="${FIGMA_AGENT_PORT:-3055}"

# 1) Copy the bridge out of Desktop (launchd jobs can't read Desktop due to macOS privacy rules).
mkdir -p "$DEST" "$USER_HOME/Library/LaunchAgents" "$USER_HOME/Library/Logs"
cp "$SRC/bridge/bridge.py" "$SRC/bridge/system_prompt.md" "$DEST/"
rm -rf "$DEST/skills" && cp -R "$SRC/bridge/skills" "$DEST/skills"
if [ -n "$RULES" ]; then
  :
elif [ -f "$DEST/rules-path" ] && [ -d "$(cat "$DEST/rules-path")" ]; then
  RULES="$(cat "$DEST/rules-path")"
elif [ -d "$SRC/team-rules" ]; then
  RULES="$SRC/team-rules"
else
  RULES="$SRC/team-rules.example"
fi
printf '%s' "$RULES" > "$DEST/rules-path"
# a copy too, used when macOS doesn't let the background bridge read that folder (Desktop, Documents…)
rm -rf "$DEST/team-rules" && cp -R "$RULES" "$DEST/team-rules"

# 2) Stop any manually started bridge holding the port.
pkill -f "$DEST/bridge.py" 2>/dev/null || true

# 3) Write the LaunchAgent (socket-activated, no KeepAlive => runs only on demand).
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>$DEST/bridge.py</string>
  </array>
  <key>Sockets</key>
  <dict>
    <key>Listeners</key>
    <dict>
      <key>SockNodeName</key><string>localhost</string>
      <key>SockServiceName</key><string>$PORT</string>
      <key>SockType</key><string>stream</string>
    </dict>
  </dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$USER_HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>CLAUDE_BIN</key><string>$CLAUDE_BIN</string>
    <key>FIGMA_AGENT_PORT</key><string>$PORT</string>
    <key>FIGMA_AGENT_MODEL</key><string>${FIGMA_AGENT_MODEL:-opus}</string>
    <key>FIGMA_AGENT_EFFORT</key><string>${FIGMA_AGENT_EFFORT:-medium}</string>
    <key>PYTHONUNBUFFERED</key><string>1</string>
  </dict>
  <key>WorkingDirectory</key><string>$DEST</string>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>ThrottleInterval</key><integer>2</integer>
  <key>ProcessType</key><string>Interactive</string>
</dict>
</plist>
EOF

# 4) (Re)load it.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
for _ in 1 2 3 4 5 6 7 8 9 10; do
  launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || break
  sleep 0.5
done
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "✅ Installed. The bridge starts when you open the Figma plugin. Log: $LOG"
echo "   Team rules: $RULES"

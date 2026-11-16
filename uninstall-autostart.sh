#!/bin/bash
# Remove the on-demand bridge and its local data (you can still run ./start.sh by hand).
USER_HOME="$(dscl . -read "/Users/$(id -un)" NFSHomeDirectory | awk '{print $2}')"
LABEL="com.figma-agent.bridge"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$USER_HOME/Library/LaunchAgents/$LABEL.plist"
rm -rf "$USER_HOME/Library/Application Support/FigmaAgent"
echo "Pollie bridge removed"

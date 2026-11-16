#!/bin/bash
# Double-click to run the bridge in a Terminal window; close the window or press Ctrl+C to stop.
cd "$(dirname "$0")"
pkill -f "python3 bridge.py" 2>/dev/null
exec ./start.sh

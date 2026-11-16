#!/bin/bash
# Start the Pollie bridge (keeps Claude Code warm). Ctrl+C to stop.
#   FIGMA_AGENT_MODEL=opus  FIGMA_AGENT_EFFORT=medium|high  ./start.sh
cd "$(dirname "$0")/bridge" && exec python3 bridge.py

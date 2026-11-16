# Installing Pollie (instructions for a coding agent)

You are a coding agent (Claude Code, Codex, …) asked to install Pollie on this Mac for the user.
Do the steps below in order, tell the user briefly what you did, and stop at the two steps only a human can do.
Don't edit any files in the repo, don't ask for or handle passwords, and don't use sudo.

## 1. Check the machine
- macOS only. Run `sw_vers`; stop and tell the user if this isn't a Mac.
- `python3 --version` must work (macOS offers to install the Command Line Tools the first time — if a dialog appears, ask the user to click Install and wait).
- `git --version` must work.
- Claude Code: `command -v claude`. If it's missing, tell the user to install Claude Code first and stop.
  Logged in? Run `claude -p "Reply OK" --max-turns 1` (it prints OK when signed in). If it fails, ask the user to run `claude` once in Terminal to sign in, then continue.
- Codex is optional: if `command -v codex` works, mention that Codex models will also be available.

## 2. Get the code
- Repository: the URL the user gave you; if none, the repository this file came from (default `https://github.com/danieltseng/pollie.git`). A private repo needs the user's GitHub access (e.g. `gh auth login`).
- If `~/pollie` doesn't exist: `git clone <repository> ~/pollie`
- If it exists and is a git repo of Pollie: `git -C ~/pollie pull`
- Never put it in Desktop, Documents or Downloads (macOS blocks the background bridge there).

## 3. Install the bridge
- If the user gave you a folder with their team's rules, run `~/pollie/install-autostart.sh --rules <that folder>`; otherwise run `~/pollie/install-autostart.sh`.
- Verify: `curl -s -H "Host: localhost:3055" http://127.0.0.1:3055/health` must print `{"ok": true}` (the first request starts the bridge; retry once after 2 seconds if needed).
- If it fails, show the last lines of `~/Library/Logs/figma-agent.log` to the user.

## 4. Make the Figma step quick
Run `open -R ~/pollie/plugin/manifest.json` (shows the file in Finder) and
`printf '%s' "$HOME/pollie/plugin/manifest.json" | pbcopy` (puts its path on the clipboard).

## 5. Hand over to the user (you can't do these)
Tell the user, in their language, exactly this:
1. In **Figma Desktop** (not the browser): menu **Plugins › Development › Import plugin from manifest…**. In the file dialog press **⌘⇧G**, then **⌘V** (the path is already copied) and **Enter**, then **Open**.
2. Open any design file → **Plugins › Development › Pollie** → click **Connect**. A macOS dialog asks to allow the connection: click **Allow** (only if they just clicked Connect).
3. To update later: ask the agent again, or run `cd ~/pollie && git pull && ./install-autostart.sh` and reopen the plugin.

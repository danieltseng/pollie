# Pollie 🌼

**Run your own Claude Code or Codex agent inside Figma.**

Select layers, type what you want, and Pollie changes the canvas for you — using this file's components, variables and styles.

- **For** designers on a Mac (Figma Desktop) who already use — or want to try — Claude Code or Codex.
- **Does** edits, new screens, user-flow diagrams, design-system cleanup and layer renaming — right on the canvas, one Cmd+Z undoes the whole turn.
- **Different from Figma's built-in AI**: it's *your* agent and *your* subscription, it follows *your* design system and team rules, and there's no Pollie server in between — the plugin talks to a small bridge on your own Mac, and your agent talks to its own provider as usual.

<!-- Demo: add a 30–60s GIF or video here (select screens → type a request → canvas updates) -->

<details>
<summary>More about how it works</summary>

Select layers in Figma and tell the Claude Code or Codex on your own computer what to do: edit designs, build new screens, connect screens into a flow, or tidy layer names to your team's rules. Changes follow the file's components, variables and styles, appear right on the canvas, and a single Cmd+Z undoes the whole turn.

Everyone installs it on their own Mac and uses their own Claude / ChatGPT account. Errands (your conversations with Pollie) and personal settings stay on your computer; "This file" memory and skills are saved in the Figma file and travel with it.

</details>

---

## Quick install with your agent

Already use Claude Code or Codex? Paste this to it in Terminal:

```
Install Pollie for me by following https://github.com/danieltseng/pollie/blob/main/INSTALL-WITH-AGENT.md
```

It checks your setup, downloads Pollie, installs the bridge, and then tells you the two steps only you can do in
Figma (import the plugin, click Allow). Prefer doing it by hand? Follow the steps below.

## Install (first time, about 5 minutes)

### You need

| Item | Notes |
|---|---|
| macOS + Figma Desktop | The Figma web app can't run plugins in development |
| Claude Code (required) | Install it following the official instructions, then run `claude` in Terminal once to sign in |
| Codex CLI (optional) | Only needed for GPT models; after installing, run `codex` once to sign in |
| Python 3 | Comes with macOS. If you're asked to install the "Command Line Tools" the first time, click Install |

### Steps

1. **Get the project**
   ```bash
   git clone https://github.com/danieltseng/pollie.git ~/pollie
   cd ~/pollie
   ```
   Don't move this folder afterwards. If you do, run step 2 again.

2. **Install the bridge (once)**
   ```bash
   ./install-autostart.sh
   ```
   macOS then starts the bridge automatically when you open the plugin, and stops it after 10 idle minutes once the plugin is closed, so it uses no resources most of the time.

3. **Import the plugin into Figma**
   Figma Desktop → menu Plugins → Development → **Import plugin from manifest…** → choose `~/pollie/plugin/manifest.json`

4. **Open the plugin**
   Any design file → Plugins → Development → **Pollie**.
   The first time you'll see a welcome screen. Click **Connect**; your Mac shows "Pollie (a Figma plugin window) is asking to connect…" — click **Allow**. When your agents are detected, click **Get started**. After that it connects straight away.

   > Why Allow: the bridge runs on `localhost`, which web pages in a browser could also reach. Only a plugin you allowed on this Mac gets the connection key; everything else is refused. If this dialog appears when you didn't click Connect, click Deny.

### Reading comments (optional)

To let the agent read file comments (e.g. "do what the comments say"), it needs your own Figma personal access token:

1. Figma → account menu (top left) → Settings → Security → **Personal access tokens** → generate one with **File content: Read** and **Comments: Read**
2. Save it on your computer (never paste it into an errand or the repo):
   ```bash
   pbpaste > ~/.figma_token && chmod 600 ~/.figma_token
   ```
   (copy the token to the clipboard first, then run this)

The plugin reads the open file's key by itself; nothing else to set up.

---

## Using it

- **Select → type → Enter**: the selected screens/layers are sent to the agent automatically. "This / these" means the selection; with nothing selected it means the current page. Shift+Enter adds a line; you can stop a running turn.
- **＋ Quick actions**: Connect as flow, Apply design system, New screen, Rename layers. Picking one adds a tag to the input — send it as is or add a sentence.
- **Reference images**: paste (⌘V), drop, or pick (＋ → Add image…) up to 4 images (5 MB each). The agent uses them as visual reference — e.g. "build this screen from the screenshot" — and builds with this file's components; it doesn't place the image on the canvas.
- **Agent and model**: pick Claude Code or Codex at the bottom left of the input, model and reasoning effort at the bottom right. Switching agent in an errand that already has messages starts a new errand.
- **Comments**: "💬 N comments" above the input lists comments on the current selection; click one to hand it to the agent.
- **Errands**: each request thread you give Pollie is an errand. ☰ at the top left opens the side panel with your errands, grouped by file. Every errand is saved automatically and only disappears when you delete it. You can read errands from other files, but continue them from their own file.
- **Garden hues**: at the bottom of the Errands list — the rainbow dot gives every errand its own flower colour, or pick one colour for all. Saved for you only.
- **Several errands at once**: errands can run in parallel. If two pick the same screen, the later one waits for the earlier one to finish.
- **Minimise**: "–" at the top right shrinks the panel to a small square; click the flower to open it again. While an agent is working, the square shows the drawing-flower animation.
- **Question cards**: when a choice would change the result, the agent shows a card with options; click one and it carries on in the same turn. If an option matches a version on the canvas, hovering it jumps to that layer.
- **Memory**: say "remember…" and it's saved; the agent may also suggest something to remember (saved only if you click Remember). View, edit and delete in the Memory tab of the side panel. There are two layers (see "Where your data lives").
- **Skills**: the Skills tab lists the built-in skills. "＋ Add" lets you add your own by dropping a SKILL.md / zip or pasting text (front matter needs `name` and `description`; only text files are kept, scripts never run), and choose to save it to This file or Only me. Switch skills on/off or delete them any time; the next message uses the change.

### Where your data lives

| | Personal (About you / Only me) | File (This file) |
|---|---|---|
| What | Your preferences, personal skills, errand history | Knowledge and skills specific to this file |
| Stored in | Your Mac (`~/Library/Application Support/FigmaAgent`) | Plugin data inside the Figma file (only Pollie can read it) |
| Who sees it | Only you | Anyone who can open the file and uses Pollie, on any computer |
| Who can change it | Only you | The file's editors; each entry shows who added it |
| Note | Doesn't follow you to another computer | Copied along when the file is duplicated; never put passwords or tokens in it |

File memory and file skills are written by the file's editors, so Pollie treats them as this file's design conventions — never as instructions about your memory, settings or other files. Team rules and built-in skills come with this repo (see "Customising for your team").

---

## Customising for your team

| What | Where | How it takes effect |
|---|---|---|
| Team rules (naming, component usage… — take priority over everything else) | Your team's rules folder (see below); `team-rules.example/` is a generic start | Next message (no reinstall) |
| How-to guides (design system, new screens, flows, layer naming, Plugin API) — each quick action uses its guide | `bridge/skills/<name>/SKILL.md` | Run `./install-autostart.sh` again |
| The agent's base instructions | `bridge/system_prompt.md` | Same |

Changes in `plugin/` only need the plugin to be closed and reopened.

### Team rules

Every `.md` in the rules folder is sent with every message and wins over the generic guidance. Keep your team's
rules in their own (private) repo so they can be updated without touching Pollie:

```bash
git clone <your team's rules repo> ~/pollie-team
./install-autostart.sh --rules ~/pollie-team/team-rules   # once; Pollie remembers the folder
```

After that, `git pull` in `~/pollie-team` is enough — the next message uses the new rules. Without `--rules`, Pollie
uses `./team-rules` if it exists, otherwise the generic `team-rules.example/`. Avoid putting the rules folder in
Desktop or Documents: macOS doesn't let the background bridge read those, so it falls back to the copy made at
install time (then re-run the installer after changing rules).

---|---|---|
| Team rules (naming, component usage… — take priority over everything else) | `team-rules/*.md` | Run `./install-autostart.sh` again |
| How-to guides (design system, new screens, flows, layer naming, Plugin API) — each quick action uses its guide | `bridge/skills/<name>/SKILL.md` | Same |
| The agent's base instructions | `bridge/system_prompt.md` | Same |

Changes in `plugin/` only need the plugin to be closed and reopened.

---

## Updating

```bash
cd ~/pollie && git pull && ./install-autostart.sh
```
Then close and reopen the plugin.

## Uninstalling

```bash
cd ~/pollie && ./uninstall-autostart.sh
```
This stops the bridge and deletes local data (including all errands). Remove the plugin in Figma via Plugins → Development → Manage plugins in development.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Welcome screen says "Can't reach the local bridge", or a red dot appears next to the title | Run `./install-autostart.sh` in the project folder, then click Try again |
| Clicked Connect but no dialog appeared, or clicked Deny by mistake | Click Try again; the dialog may be behind other windows — check the Dock |
| Revoke all paired plugins | Delete `~/Library/Application Support/FigmaAgent/paired.json`; you'll pair again next time |
| "Claude Code / Codex couldn't start" after sending | Run `claude` (or `codex`) in Terminal and make sure you're signed in |
| Comments can't be read | Check that `~/.figma_token` exists and the token hasn't expired |
| Anything else | See the log at `~/Library/Logs/figma-agent.log` |

---

## Architecture (for people changing the code)

```
Figma side panel (plugin/ui.html) ──SSE / HTTP──▶ bridge (bridge/bridge.py, localhost:3055)
        ▲  postMessage                                │ Claude Code: long-lived, stream-json
        ▼                                             │ Codex: one `codex exec --json` per turn
Figma main thread (plugin/code.js)                    ▼
   reads the selection, indexes the        agent ──MCP (HTTP)──▶ figma_* tools served by the bridge
   design system, runs the agent's code ◀──────── exec ──────────────┘
```

- The bridge uses only the Python 3 that ships with macOS, no extra packages; data lives in `~/Library/Application Support/FigmaAgent`.
- Security: every request must carry the pairing key (plugin) or a secret generated at each start (agent calling Figma tools), and the Host header is checked against DNS rebinding. Claude Code only gets the Figma tools; Codex runs with command execution, local image reading and web search turned off, and gets a minimal environment. Code the agent runs in Figma can't read the plugin's stored key.
- Agent tools: `figma_execute` (runs Plugin API code — edits, new layers, layout and connections all go through it), `figma_read`, `figma_design_system`, `figma_page_overview`, `figma_annotations`, `figma_comments`, `figma_screenshot`, `figma_file_skill` (reads a skill saved in the file), plus `ask_user`, `remember` and `suggest_memory`.
- The helpers `h` available to agent code (`h.component`, `h.fill`, `h.text`, `h.frame`, `h.arrow`…) are defined in `plugin/code.js` and documented in `bridge/system_prompt.md`.
- Environment variables: `FIGMA_AGENT_MODEL` (default `opus`), `FIGMA_AGENT_EFFORT` (default `medium`), `FIGMA_AGENT_PORT` (default 3055).
- Testing: with the bridge running, `python3 -I tests/fake_plugin.py "instruction"` simulates the plugin for one full turn.

## Known limitations

- Design files have no native connectors, so flow arrows are vector lines (FigJam uses native connectors).
- Library components are listed only if the file already uses them; the agent finds others through the teamLibrary API.
- Codex replies appear all at once rather than streaming word by word.

## License

MIT — see [LICENSE](LICENSE).

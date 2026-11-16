# Team rules (example)

Every `.md` file in this folder (except this README) is added to Pollie's instructions on **every** message and
**wins over** the generic guidance. Put the rules that must always hold here: naming, spacing scale, component
usage, copy tone.

These files are a generic starting point. To use your own rules:

1. Copy this folder somewhere outside the Pollie project — ideally into your team's own (private) repo, e.g.
   `~/pollie-team/team-rules`.
2. Edit the files (one topic per file; short bullet points with right/wrong examples work best — every word is sent
   with each message).
3. Install once with `./install-autostart.sh --rules ~/pollie-team/team-rules`. Pollie remembers the folder; after a
   `git pull` there, the next message already uses the new rules.

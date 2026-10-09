# Security

aihud reads the local transcript files of Claude Code, Codex and Antigravity, read only. It changes nothing in them and sends nothing off your machine.
Its local server listens on `127.0.0.1` only, refuses requests with a foreign `Host` or `Origin` header, and writes only inside its own folder (`~/.aihud` by default).

To report a vulnerability, please use GitHub's private vulnerability reporting for this repository (Security tab → "Report a vulnerability").
Please do not open a public issue for security problems.

Supported versions: during 0.x only the latest released version receives fixes.
You will get a first answer within 14 days.

aihud is an independent project, not affiliated with Anthropic, OpenAI or Google. Claude Code, Codex and Antigravity are trademarks of their respective holders.

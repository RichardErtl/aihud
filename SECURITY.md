# Security

aihud reads the local transcript files of Claude Code, Codex and Antigravity, read only. It changes nothing in them and sends nothing off your machine.
Its local server listens on `127.0.0.1` only, refuses requests with a foreign `Host` or `Origin` header, and writes only inside its own folder (`~/.aihud` by default).

To report a vulnerability, please use GitHub's private vulnerability reporting for this repository (Security tab → "Report a vulnerability").
If that is not available, open a GitHub issue that describes the problem without exploit details or secrets, and the maintainer will follow up privately.

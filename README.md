<p align="center">
  <img src="assets/berry.png" alt="Berry, the Numo mascot" width="160" />
</p>

<h1 align="center">numo-cli</h1>

<p align="center"><strong>The ADHD-friendly CLI for Numo — for humans and AI agents.</strong><br />Meet <strong>Berry</strong>, the official Numo mascot. 🍓</p>

<p align="center">
  <a href="https://www.npmjs.com/package/numo-cli"><img src="https://img.shields.io/npm/v/numo-cli" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/numo-cli"><img src="https://img.shields.io/npm/dm/numo-cli" alt="npm downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
</p>

<p align="center"><strong>Docs:</strong> <a href="https://numo.ai/cli">numo.ai/cli</a> · <strong>Agent/JSON contract:</strong> <a href="AGENTS.md">AGENTS.md</a></p>

`numo-cli` is the official command-line client for the **Numo ADHD planner** — create, complete, and manage tasks from your terminal or an AI agent. It talks to the hosted Numo API; you sign in with your Numo account.

```bash
# Install — pick one:
curl -fsSL https://raw.githubusercontent.com/mindistio/numo-cli/main/install.sh | bash   # standalone binary (no Node.js)
npm install -g numo-cli                                                                   # or: npx numo-cli <command>

numo login
numo tasks create "Buy milk"
numo tasks list
```

Dual-mode by design: a TTY gets tables, colors, and a short interactive wizard; pipes and `--json` get clean structured output for scripts and agents. Run `numo --help`, or see [AGENTS.md](AGENTS.md) for the full command, auth, and error contract.

## Notes

This repository is the public source for the `numo-cli` npm package, published so `npm publish --provenance` can attest the build against the source. It is **not** set up for self-hosting or external contribution — Issues and Pull Requests are not actively monitored. For support, email **help@numo.ai**.

## License

MIT © [Mindist, Inc.](https://numo.ai)

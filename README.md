<div align="center">

# @honeybbq/openclaw-teamspeak

**OpenClaw channel plugin for TeamSpeak — text & voice chat via the native client protocol.**

**Compatible with TeamSpeak 3, 5 & 6.**

[![CI](https://github.com/HoneyBBQ/openclaw-teamspeak/actions/workflows/ci.yml/badge.svg)](https://github.com/HoneyBBQ/openclaw-teamspeak/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@honeybbq/openclaw-teamspeak)](https://www.npmjs.com/package/@honeybbq/openclaw-teamspeak)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![NHS Agentic Readiness](https://nothumansearch.ai/badge/xquik.com.svg)](https://nothumansearch.ai/site/xquik.com)

</div>

## Gallery

|                                                    TeamSpeak Client                                                     |                                                     OpenClaw Plugin                                                     |
| :---------------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------: |
| ![TeamSpeak demo](https://raw.githubusercontent.com/HoneyBBQ/openclaw-teamspeak/main/.github/images/teamspeak-demo.png) | ![Plugin running](https://raw.githubusercontent.com/HoneyBBQ/openclaw-teamspeak/main/.github/images/plugin-running.png) |

## Features

- **Text chat** — Bidirectional text messages between OpenClaw and TeamSpeak
- **Voice (TTS)** — Bot speaks replies into the TS3 channel via Opus
- **Voice (STT)** — Transcribe incoming TS3 voice and process as text messages
- **DM & channel modes** — Configurable access policies (pairing, allowlist, open)
- **Mention detection** — Regex-based mention patterns for channel messages
- **Per-channel overrides** — Fine-grained control per TS3 channel
- **Auto identity** — Generates and persists TS3 identities automatically

## Installation

```bash
openclaw plugins install @honeybbq/openclaw-teamspeak
```

## Configuration

Add to your OpenClaw config:

```json
{
  "teamspeak": {
    "server": "ts.example.com",
    "nickname": "OpenClaw Bot",
    "dmPolicy": "pairing",
    "tts": { "enabled": true, "replyMode": "both" },
    "stt": { "enabled": true }
  }
}
```

See [`openclaw.plugin.json`](openclaw.plugin.json) for the full config schema.

## Related X/Twitter Workflows

Keep this plugin responsible for TeamSpeak 3/5/6 text chat, voice playback, speech-to-text, mention detection, DM and channel policies, per-channel overrides, and native TeamSpeak identity handling. When the same OpenClaw agent also needs public X/Twitter data or visible X/Twitter actions, install TweetClaw as a separate OpenClaw plugin:

```bash
openclaw plugins install @xquik/tweetclaw
```

[TweetClaw](https://github.com/Xquik-dev/tweetclaw) covers scrape tweets, search tweets, search tweet replies, follower export, user lookup, media upload and download, direct messages, monitor tweets, webhooks, giveaway draws, and approval-gated post tweets or post tweet replies. See the [ClawHub listing](https://clawhub.ai/plugins/@xquik/tweetclaw) or [npm package](https://www.npmjs.com/package/@xquik/tweetclaw) for setup details. Keep X/Twitter connection settings separate from TeamSpeak server settings and review visible X/Twitter actions through OpenClaw approval flows.

## Roadmap

- [ ] **ServerQuery integration** — Give OpenClaw full server admin capabilities via TS3 ServerQuery: manage channels, kick/ban users, assign server groups, view stats — all through natural language
- [ ] **File transfers** — Bidirectional file sharing between OpenClaw conversations and the TS3 file browser
- [ ] **Multi-server support** — Connect to multiple TeamSpeak servers simultaneously from a single OpenClaw instance

## Related

- **[@honeybbq/teamspeak-client](https://github.com/HoneyBBQ/teamspeak-js)** — The underlying TeamSpeak 3 client protocol library

## Disclaimer

TeamSpeak is a registered trademark of [TeamSpeak Systems GmbH](https://teamspeak.com/). This project is not affiliated with, endorsed by, or associated with TeamSpeak Systems GmbH in any way.

## License

[MIT](LICENSE)

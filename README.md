# Flagsmith Slack Approvals

A Slack bot for self-hosted [Flagsmith](https://github.com/Flagsmith/flagsmith). Nobody flips a flag alone: someone requests it in Slack, a teammate approves with a button, Flagsmith changes the flag, and every step is written to an audit log.

Built for the WeMakeDevs "Toggle Wars" hackathon, track 3 (Build on Open Source Flagsmith).

## How it works

1. `/flag on checkout_v2` posts a card with **Approve** and **Reject**.
2. A different teammate clicks **Approve** (the requester cannot approve their own request).
3. The bot calls your self-hosted Flagsmith Admin API (`/api/v1/environments/<env>/featurestates/`) to change the flag.
4. The card updates with the before and after state, and a line is appended to `audit.jsonl`:

```json
{"ts":"2026-11-28T10:00:00Z","event":"applied","flag":"checkout_v2","env":"demo","requester":"U01","approver":"U02","before":false,"after":true}
```

Commands: `/flag on <name>`, `/flag off <name>`, `/flag status <name>`.

## Setup

1. Start Flagsmith: `docker compose up -d`, open http://localhost:8000, create an account, a project, an environment and a feature (for example `checkout_v2`). Create an organisation API key.
2. Create the Slack app: https://api.slack.com/apps > Create New App > From a manifest > paste `slack-app-manifest.yml`. Install it to your workspace. Create an app-level token with the `connections:write` scope. Invite the bot to a channel.
3. `cp .env.example .env` and fill in the tokens and Flagsmith keys.
4. `npm install && set -a && . ./.env && set +a && npm start`
5. In Slack: `/flag on checkout_v2`, then approve from a second account.

Use a demo environment, not production keys.

## Tests

`npm test` runs the Flagsmith client against a local mock server plus unit tests for parsing and the approval rule.

## Credits

The idea of Approve/Reject cards with an audit trail was inspired by [MRiARC/biscuit](https://github.com/MRiARC/biscuit) (Apache-2.0). No code was copied. License: Apache-2.0.

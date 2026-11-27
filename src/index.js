import bolt from '@slack/bolt';
import { randomUUID } from 'node:crypto';
import { Flagsmith } from './flagsmith.js';
import { writeAudit } from './audit.js';
import { parseCommand, approvalBlocks, resultBlocks, canApprove } from './approval.js';

const { App } = bolt;
const need = (k) => { if (!process.env[k]) throw new Error(`Missing env ${k}`); return process.env[k]; };

const fs = new Flagsmith({
  baseUrl: need('FLAGSMITH_URL'),
  apiKey: need('FLAGSMITH_API_KEY'),
  environmentKey: need('FLAGSMITH_ENV_KEY'),
});
const ENV_LABEL = process.env.FLAGSMITH_ENV_LABEL || 'demo';
const AUDIT = process.env.AUDIT_LOG || 'audit.jsonl';

const app = new App({
  token: need('SLACK_BOT_TOKEN'),
  appToken: need('SLACK_APP_TOKEN'),
  socketMode: true,
});

const pending = new Map(); // id -> request

// /flag on|off <name>   and   /flag status <name>
app.command('/flag', async ({ command, ack, respond, client }) => {
  await ack();
  const sub = (command.text || '').trim();
  if (sub.toLowerCase().startsWith('status ')) {
    const name = sub.slice(7).trim();
    try {
      const f = await fs.getFlag(name);
      return respond(`\`${name}\` is currently *${f.enabled ? 'ON' : 'OFF'}* in ${ENV_LABEL}.`);
    } catch (e) { return respond(`Error: ${e.message}`); }
  }
  const parsed = parseCommand(sub);
  if (!parsed) return respond('Usage: `/flag on <name>`, `/flag off <name>`, `/flag status <name>`');
  try { await fs.getFlag(parsed.flag); } catch (e) { return respond(`Error: ${e.message}`); }
  const id = randomUUID();
  const req = { id, ...parsed, requester: command.user_id, channel: command.channel_id };
  pending.set(id, req);
  writeAudit(AUDIT, { event: 'requested', request: id, flag: req.flag, env: ENV_LABEL, enabled: req.enabled, requester: req.requester });
  await client.chat.postMessage({
    channel: command.channel_id,
    text: `Flag change requested: ${req.flag}`,
    blocks: approvalBlocks({ ...req, env: ENV_LABEL }),
  });
});

app.action('flag_approve', async ({ ack, body, action, client }) => {
  await ack();
  const req = pending.get(action.value);
  const approver = body.user.id;
  const check = canApprove(req, approver);
  if (!check.ok) {
    return client.chat.postEphemeral({ channel: body.channel.id, user: approver, text: check.reason });
  }
  pending.delete(req.id);
  let text;
  try {
    const { before, after } = await fs.setFlag(req.flag, req.enabled);
    writeAudit(AUDIT, { event: 'applied', request: req.id, flag: req.flag, env: ENV_LABEL, requester: req.requester, approver, before, after });
    text = `:white_check_mark: \`${req.flag}\` in *${ENV_LABEL}*: ${before ? 'ON' : 'OFF'} -> *${after ? 'ON' : 'OFF'}*. Requested by <@${req.requester}>, approved by <@${approver}>.`;
  } catch (e) {
    writeAudit(AUDIT, { event: 'failed', request: req.id, flag: req.flag, approver, error: e.message });
    text = `:x: Flagsmith call failed: ${e.message}`;
  }
  await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text, blocks: resultBlocks(text) });
});

app.action('flag_reject', async ({ ack, body, action, client }) => {
  await ack();
  const req = pending.get(action.value);
  if (!req) return;
  pending.delete(req.id);
  writeAudit(AUDIT, { event: 'rejected', request: req.id, flag: req.flag, requester: req.requester, rejecter: body.user.id });
  const text = `:no_entry: Request to change \`${req.flag}\` rejected by <@${body.user.id}>.`;
  await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text, blocks: resultBlocks(text) });
});

await app.start();
console.log('Flagsmith approvals bot running (Socket Mode)');

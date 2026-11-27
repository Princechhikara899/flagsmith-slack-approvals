// Pure logic: parse commands, build Slack Block Kit cards, enforce approval rules.
// The Approve/Reject card + audit trail idea is inspired by MRiARC/biscuit
// (Apache-2.0). No code was copied.

export function parseCommand(text) {
  const m = /^\s*(on|off|enable|disable)\s+([\w.\-:]+)\s*$/i.exec(text || '');
  if (!m) return null;
  const enabled = ['on', 'enable'].includes(m[1].toLowerCase());
  return { flag: m[2], enabled };
}

export function approvalBlocks({ flag, enabled, requester, env, id }) {
  const verb = enabled ? 'ENABLE' : 'DISABLE';
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<@${requester}> wants to *${verb}* flag \`${flag}\` in *${env}*.\nA teammate (not the requester) must approve.`,
      },
    },
    {
      type: 'actions',
      block_id: `req_${id}`,
      elements: [
        { type: 'button', style: 'primary', action_id: 'flag_approve', value: id, text: { type: 'plain_text', text: 'Approve' } },
        { type: 'button', style: 'danger', action_id: 'flag_reject', value: id, text: { type: 'plain_text', text: 'Reject' } },
      ],
    },
  ];
}

export function resultBlocks(text) {
  return [{ type: 'section', text: { type: 'mrkdwn', text } }];
}

/** Four-eyes rule: approver must differ from requester. */
export function canApprove(request, approver) {
  if (!request) return { ok: false, reason: 'Request not found or already handled.' };
  if (request.requester === approver) return { ok: false, reason: 'You cannot approve your own request.' };
  return { ok: true };
}

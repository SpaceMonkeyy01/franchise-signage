// Sending mail, and keeping what was sent.
//
// Two providers behind one call, chosen the same way the storage driver and the
// team-auth provider are: Resend when RESEND_API_KEY is configured, and the
// OUTBOX when it is not — which records the message and delivers nothing. There
// is no Resend key on this machine (docs/STATE.md), so the outbox is what runs,
// and /admin/outbox reads it back.
//
// Every message is written to `sent_emails` either way, BEFORE the send is
// attempted and updated after. Mail that a provider accepted and then dropped is
// the hardest kind of support question, and the answer has to exist locally.

import { query, queryOne } from '../db/pool';

export interface EmailMessage {
  kind: string;
  to: string;
  cc?: string | null;
  subject: string;
  html: string;
  from: string;
  requestId?: string | null;
  replyTo?: string | null;
}

export interface SendResult {
  id: string;
  provider: 'resend' | 'outbox';
  delivered: boolean;
  error?: string;
}

export function emailProvider(): 'resend' | 'outbox' {
  return process.env.RESEND_API_KEY ? 'resend' : 'outbox';
}

/**
 * Send one message.
 *
 * Never throws: a notification that fails must not roll back the transition that
 * triggered it. A reviewer who did not get their email is a chase-up; a request
 * stuck half-transitioned because the mail server was down is a bug.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const provider = emailProvider();

  const row = await queryOne<{ id: string }>(
    `insert into sent_emails
       (request_id, kind, to_email, cc_email, subject, html, provider)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning id`,
    [
      message.requestId ?? null,
      message.kind,
      message.to,
      message.cc ?? null,
      message.subject,
      message.html,
      provider,
    ],
  );
  const id = row!.id;

  if (provider === 'outbox') {
    return { id, provider, delivered: false };
  }

  try {
    const { resend } = await import('./resend');
    const { data, error } = await resend().emails.send({
      from: message.from,
      to: message.to,
      cc: message.cc ?? undefined,
      replyTo: message.replyTo ?? undefined,
      subject: message.subject,
      html: message.html,
    });
    if (error) throw new Error(error.message);

    await query(`update sent_emails set provider_message_id = $2 where id = $1`, [
      id,
      data?.id ?? null,
    ]);
    return { id, provider, delivered: true };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    console.error(`email ${message.kind} to ${message.to} failed`, cause);
    await query(`update sent_emails set error = $2 where id = $1`, [id, error]);
    return { id, provider, delivered: false, error };
  }
}

export interface SentEmailRow {
  id: string;
  request_id: string | null;
  kind: string;
  to_email: string;
  cc_email: string | null;
  subject: string;
  html: string;
  provider: string;
  error: string | null;
  created_at: string;
}

/** The outbox, newest first — what /admin/outbox renders. */
export function recentEmails(limit = 25): Promise<SentEmailRow[]> {
  return query<SentEmailRow>(
    `select id, request_id, kind, to_email, cc_email, subject, html, provider, error, created_at
       from sent_emails order by created_at desc limit $1`,
    [limit],
  );
}

export function getEmail(id: string): Promise<SentEmailRow | null> {
  return queryOne<SentEmailRow>(
    `select id, request_id, kind, to_email, cc_email, subject, html, provider, error, created_at
       from sent_emails where id = $1`,
    [id],
  );
}

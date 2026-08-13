# Compliance & Legal Overview

_Last updated: 2026-08-13_

This document summarizes anonshare's data-handling posture in plain terms. It supplements, and does not replace, the [Privacy Policy](privacy.html) and [Terms](terms.html) published on the site.

## Data collected

- **Room content**: never collected in readable form. Content is encrypted client-side before it reaches the relay, and the relay discards it once the room's TTL expires or it is deleted.
- **Account data**: none. There is no sign-up, no email collection, and no persistent user identifiers tied to a real identity.
- **Analytics**: the marketing pages use Cloudflare's cookieless Web Analytics, which does not use tracking cookies or fingerprinting and cannot identify individual visitors.
- **Operational metadata**: the relay necessarily sees connection metadata (IP address, timestamps, message sizes) needed to route encrypted traffic and apply rate limits. This is not retained beyond what is needed for abuse prevention and is not linked to room content.

## Data retention

- Room content: erased when the room's TTL expires after the last participant leaves, or immediately on owner-initiated deletion. There is no backup or archive of room content server-side.
- Local device data: an offline copy may be cached in the browser (IndexedDB) purely for offline continuity; this is under the user's control and can be cleared from Settings → "Delete offline copy."

## GDPR / CCPA posture

- Because no personal data is collected or retained for room content, most data-subject rights (access, deletion, portability) are satisfied by default — there is nothing to export or delete beyond what the user already controls locally.
- If aggregate, non-identifying analytics data is ever used to fulfill a specific request, that will be handled on a best-effort basis via the contact below.

## Data Processing Agreement (DPA)

For teams that need a signed DPA before adopting anonshare internally: given the zero-retention, zero-PII design, most standard DPA terms (sub-processor lists, breach notification, deletion guarantees) are straightforward to satisfy. Contact `avishkarkedar+text@gmail.com` to discuss a DPA for your organization.

## Responsible disclosure

See [SECURITY.md](SECURITY.md) for how to report a security issue.

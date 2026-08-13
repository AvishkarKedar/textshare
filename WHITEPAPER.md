# anonshare — Architecture & Security Whitepaper

_Last updated: 2026-08-13_

## 1. Overview

anonshare ("textshare") is a live, end-to-end encrypted text and code sharing tool. Rooms are identified by a 6-character code, require no account, and are erased once everyone has left. This document describes how it is built and the security properties it does and does not provide.

## 2. High-level architecture

- **Front end**: static site (HTML/CSS/JS), built with Vite, deployed on Cloudflare Pages at `code.avishkark.in`.
- **Editor & sync engine**: CodeMirror 6 bound to a Yjs CRDT document (`yjs`, `y-codemirror.next`) for conflict-free concurrent editing, with `y-indexeddb` for local offline persistence.
- **Relay**: a Cloudflare Worker (`textshare-sync`) that relays encrypted bytes between peers in a room over WebSockets. It performs no decryption and stores no plaintext.
- **Presence**: `y-protocols/awareness` for cursors, names, colors, and typing indicators, propagated the same way as document updates.
- **Admin dashboard** (optional, operator-only): a separate static site, deployed on its own subdomain (`admin.code.avishkark.in`), that talks directly to the relay's `/admin/*` API, gated by a single operator secret (`ADMIN_PASSWORD`). It is fully disabled unless that secret is set. See §8.

## 3. Encryption model

- **Key derivation**: PBKDF2-SHA256 over `code + ":" + password`, with two independently salted derivations:
  - `salt = "textshare|<code>"` → AES-GCM 256-bit encryption key.
  - `salt = "textshare-auth|<code>"` → a value sent to the relay so it can verify a client knows the room secret, without ever seeing the encryption key itself.
  - Current iteration count: 200,000 rounds. This is being reviewed against current OWASP guidance (600k+ for PBKDF2-SHA256) as a planned hardening step.
- **Payload encryption**: AES-GCM with a fresh random 96-bit IV per message. All Yjs document updates, awareness updates, and chat messages are sealed client-side before they touch the network.
- **What the relay can see**: sealed ciphertext bytes, connection metadata (IP, timing, message sizes), and the room code. It cannot decrypt content because it never receives the derived key.
- **What the relay cannot see**: plaintext content, the password, or the derived encryption key.

## 4. Room lifecycle

- Rooms are created with an owner token (a random client-side secret) and an optional password.
- Time-to-live is chosen at creation (10 minutes / 1 hour / 24 hours) and counts down after the last participant disconnects.
- The owner can lock (read-only for others), suspend, or permanently delete a room at any time; these are authenticated using the owner token, never the encryption key.
- Deleting a room removes it from the relay immediately; there is no soft-delete or backup copy server-side.

## 5. Rate limiting & abuse controls

The relay enforces connection- and message-level limits per room and per IP (max connections per room, messages/sec, requests/minute per IP, room-creation and auth attempts per minute) to reduce abuse and denial-of-service risk. These are intentionally conservative and tuned for a free-tier deployment. Most of these caps (all except the per-message rate) can be adjusted at runtime by the operator from the admin dashboard, without a redeploy - see §8.

## 6. Threat model

**In scope / mitigated:**
- A network observer or the relay operator reading room content in transit or at rest.
- Casual link-guessing (6-character codes drawn from a 32-symbol alphabet, further protected by an optional password).

**Explicitly out of scope:**
- A compromised or malicious end-user device (nothing protects you from someone who already has plaintext access on their own machine).
- Traffic analysis / metadata leakage (room activity timing and sizes are visible to the relay operator, even though content is not).
- Weak or reused passwords chosen by the room creator — the security of a password-protected room is only as strong as that password.
- Denial-of-service beyond the built-in rate limits.

## 7. Known limitations & roadmap

- No formal third-party security audit has been performed yet; this document is a self-assessment, not an independent certification.
- PBKDF2 iteration count is planned to increase (see §3).
- No SSO/identity-linked access control today — every room is anonymous by design. Identity-linked "private" rooms are a possible future addition for team/enterprise use, kept clearly separate from the anonymous public product.

## 8. Admin dashboard & the room registry

To let the site operator moderate abusive rooms and tune rate limits without redeploying, the relay maintains one additional, deliberately minimal data structure: a global index of currently-active room codes, each with only its creation timestamp, TTL, and whether a password is set. This index:

- Contains **no** message content, chat text, passwords, password hashes, or derived/encryption keys.
- Contains nothing that a participant doesn't already know just by being in the room (the code, roughly when it was created, and its lifetime).
- Is written to on room creation and deletion on a best-effort basis; if the write fails, room creation and deletion still succeed normally.
- Self-prunes entries once they are well past their TTL, so it cannot grow into a permanent historical log of every room ever created.
- Is only reachable through the `/admin/*` API, itself gated by a single operator secret (`ADMIN_PASSWORD`) that is never committed to the repository and is set directly on the Worker. If that secret is not configured, the entire admin surface — including this index's read/write paths that back it — returns `503` and is inert.

The admin dashboard itself is a separate static site on its own subdomain, so a bug or compromise of the public-facing marketing site cannot reach it, and vice versa. Room suspension/deletion performed from the dashboard uses the same underlying per-room administration path as an owner's own token, just authenticated with the operator secret instead.

Questions about this document: `avishkarkedar+text@gmail.com`.

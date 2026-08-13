# Security Policy

## Reporting a vulnerability

If you believe you've found a security vulnerability in anonshare, please report it privately rather than opening a public issue.

- **Contact**: `avishkarkedar+text@gmail.com` (subject line: "anonshare security report")
- **What to include**: a description of the issue, steps to reproduce, and its potential impact. Proof-of-concept code is welcome.
- **Response time**: we aim to acknowledge reports within 3 business days and to provide a fix or mitigation timeline within 10 business days for confirmed issues.

## Scope

In scope:
- The anonshare front end (`code.avishkark.in`) and the relay Worker (`textshare-sync`).
- The end-to-end encryption implementation described in [WHITEPAPER.md](WHITEPAPER.md).

Out of scope:
- Denial-of-service testing against the production relay.
- Social engineering, phishing, or physical attacks.
- Third-party dependencies (please report upstream, but we're happy to be CC'd).

## Safe harbor

We will not pursue legal action against good-faith security research that stays within this scope, respects user privacy, and gives us a reasonable opportunity to fix the issue before any public disclosure.

See [COMPLIANCE.md](COMPLIANCE.md) for our broader data-handling posture.

# Live verification scripts

Run against production from the repo root (`node scripts/<name>.mjs`).
No dependencies beyond Node 18+ (the `ws` package ships in devDependencies).

| Script | What it proves |
| --- | --- |
| `relay-version-discriminator.mjs` | Which relay generation the VPS is running: leaked-password auth, CORS allowlist, preflight handling, file DELETE route, /run whitelist, security headers. **Run this first after any VPS redeploy** — everything green means the hardened relay is live. |
| `e2e-live-sync.mjs` | Full sync protocol against production: room create, 2 WebSocket peers, E2EE (AES-GCM sealed) updates both directions, backlog replay for late joiners, awareness relay, WebRTC P2P signaling routing, owner grant-edit, file chunk roundtrip + DELETE, wrong-password rejection, owner delete + T_KILLED broadcast. |
| `runner-matrix.mjs` | Executes one program in each of the 8 supported languages (python, javascript, bash, c, cpp, java, go, rust) and reports real pass/fail per language. |
| `live-endpoint-verify.mjs` | Pages API (status/run/generate/crypto: validation, rate limits, honesty labels) + relay basics + the two "old relay still running" tripwires. |

## Expected results on a fully-deployed stack

- `relay-version-discriminator.mjs`: **16/16**
- `e2e-live-sync.mjs`: **11/11**
- `runner-matrix.mjs`: **8/8**
- `live-endpoint-verify.mjs`: **35/35**

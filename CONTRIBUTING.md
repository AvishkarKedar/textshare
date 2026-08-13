# Contributing to anonshare

Thanks for taking the time to contribute. This project is three small pieces -
a static front end, a Cloudflare Worker relay, and an optional admin dashboard
- and most changes only touch one of them.

## Before you start

- For anything more than a small fix, please open an issue first so we can
  agree on the approach before you spend time on it.
- Please don't open a public issue for a security vulnerability - see
  [SECURITY.md](SECURITY.md) instead.

## Running it locally

The front end is static files:

```bash
npm install
npm start
```

The relay is a Cloudflare Worker (the free tier is enough to develop against):

```bash
cd worker
npm install
npx wrangler dev
```

Point the app at your local relay with `?relay=localhost:8787` (or whatever
`wrangler dev` prints).

## Tests

```bash
npm test
```

Unit tests live in `tests/` and cover the pure helpers in `lib/util.js`.

## Code style

- No build tooling beyond what's already in `package.json` - keep the front
  end dependency-light and framework-free.
- Match the existing style in the file you're editing rather than introducing
  a new one.
- Keep pull requests focused on one change; it's much faster to review.

## Pull requests

1. Fork the repo and create a branch off `main`.
2. Make your change, and add or update tests where it makes sense.
3. Run `npm test` before opening the PR.
4. Describe *why* the change is needed, not just what it does.
5. Update the README, WHITEPAPER, or SECURITY docs if your change affects what
   they describe.

By contributing, you agree your contribution is licensed under this project's
[MIT License](LICENSE).

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Please be kind.

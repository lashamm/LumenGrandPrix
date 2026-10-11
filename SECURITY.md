# Security Policy

## Supported versions

Lumen GP is a pre-release prototype. Security fixes are applied to the latest
commit on the default branch only; older commits and forks are not supported.

| Version | Supported |
| ------- | --------- |
| Latest `main` | Yes |
| Older commits / forks | No |

## Reporting a vulnerability

Please report suspected security issues **privately** — do not open a public
issue, and do not include exploitable details in a pull request.

1. On the repository, open the **Security** tab and choose
   **Report a vulnerability** to start a private advisory.
2. Describe the issue, the affected file or feature, and the steps to reproduce
   it. Include the commit hash you tested.
3. Allow a reasonable amount of time for triage before any public disclosure.

The maintainer aims to acknowledge reports within a few days. Please act in good
faith: do not access data that is not yours, do not run denial-of-service tests
against shared infrastructure, and give a reasonable window to ship a fix before
disclosing publicly.

## Wallet and key safety

Lumen GP connects to the **Phantom** browser wallet on **Solana Devnet** only.
The connection is **read-only**.

- Lumen GP never asks for, reads, stores, or transmits a private key or seed
  phrase. The wallet connection only requests the public key and reads the
  Devnet SOL balance.
- Lumen GP does not build, sign, or send transactions. `sendTransaction` is
  intentionally unimplemented and throws.
- **Never submit a seed phrase or private key**, in a GitHub issue, a pull
  request, a screenshot, a log, or anywhere else. No legitimate request from
  this project will ever ask for one.
- Use a dedicated, low-value wallet for testing. Never connect a wallet that
  holds real mainnet assets to a prototype.

If you believe you have exposed a private key or seed phrase, treat that wallet
as compromised: move any funds to a new wallet immediately and stop using the
exposed one. Rotating keys is never something this project will do for you.

## Secrets in the repository

- Do not commit `.env` files, API keys, access tokens, private keys, seed
  phrases, wallet keypair JSON, certificates, or deployment credentials. These
  paths are covered by `.gitignore`.
- Remember that `.gitignore` only affects **untracked** files. If a secret was
  already committed, adding it to `.gitignore` does not remove it from history.
  Report it privately so remediation can be coordinated (see below).
- Anything prefixed with `VITE_` is compiled into the public browser bundle and
  is not secret.

## Response to a leaked credential

Rewriting Git history, force-pushing, and rotating credentials are disruptive
and are never performed silently. If a secret is found in the repository:

1. The secret is treated as compromised and must be rotated by its owner.
2. History removal (for example with `git filter-repo`) is coordinated with the
   maintainer and any collaborators before it is run.

## Deployment security headers

The Vercel deployment sets security response headers from `vercel.json`:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` and `frame-ancestors 'none'`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` denying camera, microphone, geolocation, payment, and USB
- `Strict-Transport-Security` (HSTS) with a two-year max-age
- A `Content-Security-Policy`

The CSP is intentionally written to allow the application to run without
breaking the game engine or the wallet flow, and it has two important caveats:

1. **Browser-extension wallets.** Phantom injects its provider into the page.
   Extension injection is not subject to the page CSP in most browsers, but this
   has not been verified across every browser and Phantom version. If wallet
   connection stops working after a header change, relax `script-src` (for
   example by adding the extension origin) or switch to
   `Content-Security-Policy-Report-Only` while investigating.
2. **RPC and analytics endpoints.** `connect-src` permits the Solana Devnet RPC
   and Vercel's analytics endpoints. If any of those URLs change, the CSP must
   be updated or the corresponding feature will be blocked.

`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` are deliberately
**not** set, because they can interfere with the wallet popup flow.

## Scope

In scope: the application source in `src/`, the build and deployment
configuration, and the wallet-connection code.

Out of scope: vulnerabilities in third-party dependencies (report those
upstream, though we welcome a heads-up), the Solana Devnet public RPC, and the
Phantom extension itself. See the dependency notes in `README.md` for the
results of `npm audit`.

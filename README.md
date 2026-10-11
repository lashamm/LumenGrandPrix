# Lumen GP

Lumen GP is a browser-based, 2D pixel-art racing game built with React,
TypeScript, Vite, and Phaser 3. It ships two playable modes — a 300-metre drag
strip and a generated circuit-racing mode — and includes a read-only Solana
Devnet integration through the Phantom wallet. Everything is rendered
procedurally at runtime, so the project has no external art or audio assets.

> **Project status: pre-release prototype.** Lumen GP is developed and tested on
> Solana **Devnet** only. It is read-only on-chain, it does not sign or send
> transactions, and it is not production-ready. See the [Roadmap](#roadmap) for
> what is planned versus what actually exists today.

## Features

All of the following are implemented in the current source tree.

### Drag racing

- A 300 m strip with launch-timing and shift-timing skill mechanics: the player
  holds throttle to stage, releases inside a rev band to launch, and upshifts
  near peak power.
- AI opponents across three skill tiers, labelled Rookie, Contender, and
  Factory.
- Race modes are declared (`offline`, `online-practice`, `online-ranked`,
  `wager`); only offline AI and Devnet practice settlement are playable.

### Circuit racing

- Generated, closes-loop circuits that are validated for width and safe
  cornering before they are used, plus handcrafted tracks.
- "Slot-car" handling: the player manages throttle and brake while the steering
  servo follows the racing line, so cornering, slides, lock-ups, and spins all
  fall out of a single grip budget.
- A full field of AI cars, lap timing, positions, and a minimap.

### Garage and customization

- Body types (coupe, sedan, hatchback), named paint presets, and custom body,
  accent, and window-tint colours.
- Nine cosmetic part slots (headlights, wheels, spoiler, front and rear bumpers,
  hood, exhaust, decal, stripes), each with three levels.
- Performance upgrades in five categories (engine, weight, aero, brakes, tires)
  with a live, measured spec and stat preview.
- Two independent build bays — one for the drag car and one for the circuit car.

### Solana / wallet

- Read-only connection to the **Phantom** wallet; displays the shortened public
  address and the Devnet SOL balance.
- A local **practice ledger** that stands in for escrow on wager races. It uses
  DEVNET SOL figures held in `localStorage` and never touches the chain.

### Presentation and platform

- Fully procedural pixel art for cars and tracks.
- Light/dark theme with an customisable accent colour.
- Local persistence of the player profile, build, best times, and practice
  balance via `localStorage`.
- Responsive layouts for desktop, tablet, and mobile.

## Technology stack

| Area | Choice |
| --- | --- |
| UI framework | React 18 |
| Language | TypeScript 5 (strict) |
| Build tool | Vite 5 |
| Game engine | Phaser 3 |
| Chain | `@solana/web3.js`, `@solana/wallet-adapter-base` |
| Wallet | Phantom (hand-written, read-only adapter) |
| Analytics | `@vercel/analytics`, `@vercel/speed-insights` (Vercel only) |
| Script runner | `tsx` (for verification and simulation scripts) |

## Installation and development

Requirements: **Node.js 18 or newer** (Vite 5 requirement) and npm.

```bash
# Install dependencies
npm install

# Start the development server (http://localhost:5173)
npm run dev

# Type-check the project
npm run typecheck

# Produce a production build in dist/
npm run build

# Preview the production build locally
npm run preview
```

No environment variables are required. The Devnet RPC endpoint is defined in
source code. See [`.env.example`](./.env.example) for details.

## Package scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `npm run dev` | `vite` | Start the development server. |
| `npm run build` | `tsc -b && vite build` | Type-check, then build for production. |
| `npm run preview` | `vite preview` | Serve the production build locally. |
| `npm run typecheck` | `tsc -b` | Run the TypeScript project build (types only). |
| `npm run test` | `tsx scripts/test-circuit.ts` | Run the circuit physics and race-model test suite. |
| `npm run sim` | `tsx scripts/simulate.ts` | Run the drag-racing simulation harness. |
| `npm run sweep` | `tsx scripts/sweep.ts` | Run the parameter sweep tool. |
| `npm run car-art` | `tsx scripts/verify-car-art.ts` | Verify procedural car art coverage. |
| `npm run camera` | `tsx scripts/verify-camera.ts` | Verify circuit camera framing across tracks. |

The `scripts/` directory also contains additional analysis and preview utilities
(for example `force.ts`, `gears.ts`, `track-preview.ts`, and
`verify-circuit-art.ts`) that are not wired into `package.json`.

## Project structure

```
src/
  game/         Core simulation: drag physics, circuit physics, AI, procedural art
  ui/           React screens and HUD components
  solana/       Phantom adapter, provider, and Devnet balance hook
  racing/       Escrow interfaces (local practice ledger + on-chain stub)
  network/      Solana network configuration and provider
  state/        localStorage persistence (profile, bankroll)
  theme/        Theme providers and palettes
scripts/        Verification, simulation, and analysis utilities
```

## Solana Devnet and Phantom wallet safety

- **Devnet only.** Lumen GP is pointed at the Solana Devnet cluster. It never
  contacts mainnet.
- **Read-only.** The wallet connection requests only the public key and reads the
  Devnet balance. Lumen GP does not build, sign, or send transactions;
  `sendTransaction` is intentionally unimplemented and throws.
- **No secrets.** Lumen GP never asks for, reads, or stores a private key or seed
  phrase. Never provide a seed phrase or private key to this project or to
  anyone else.
- **Practice figures.** Wager-mode settlement and the "bankroll" are local
  practice values stored in the browser. No value is transferred on chain, and
  mainnet is disabled until a reviewed escrow program exists.
- **Use a throwaway wallet.** Because this is a prototype, connect a dedicated,
  low-value wallet rather than one that holds real assets.

## Roadmap

The following items are **not implemented** and are listed so that planned work
is not mistaken for shipped functionality.

- [ ] **On-chain escrow program** — not implemented. `OnChainEscrow` is a stub
      that fails closed and has no program id, wallet, or connection.
- [ ] **Mainnet play** — disabled. Mainnet is declared so the UI can name it,
      but it is not playable.
- [ ] **Online matchmaking (practice / ranked)** — no server exists. The client
      honestly reports the lobby as unavailable instead of inventing opponents.
- [ ] **NFTs, cars on chain, and trading** — not implemented. Builds are local
      to the browser only.
- [ ] **Cross-device persistence** — not implemented; state lives in
      `localStorage`.

## Contributing

Contributions are welcome while the project is a prototype. Please:

1. Keep changes focused and match the existing code style; the codebase favours
   heavily commented, self-contained modules.
2. Run the checks before opening a pull request:
   ```bash
   npm run typecheck
   npm run test
   npm run build
   ```
3. Do not commit secrets. This includes `.env` files, keys, and wallet material
   (all covered by `.gitignore`).
4. Do not add or claim functionality that is not implemented. The UI and docs
   are expected to describe the prototype honestly.

## Security

For vulnerability reporting, wallet safety guidance, and secret-handling rules,
see [`SECURITY.md`](./SECURITY.md). Please report security issues privately and
never include a seed phrase or private key in any report.

## Deployment

The build output is a static site in `dist/` and is deployable to any static
host. The presence of `@vercel/analytics` and `@vercel/speed-insights` indicates
the project targets **Vercel**, which is also where the analytics endpoints it
references are served. A [`vercel.json`](./vercel.json) is included to set
security response headers for that deployment.

## License

No license file is currently included in this repository. Until a license is
explicitly added, all rights are reserved by the copyright holder, and the code
is **not** offered under an open-source license.

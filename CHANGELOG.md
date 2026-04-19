# Changelog

## 1.1.2 -- 2026-04-18

### Added

- `--version` and `-v` flag support in the orchard CLI

### Changed

- Refactored CLI to use `@grainulation/barn/cli` vlog; deleted legacy template

### Removed

- Unused imports and dead code flagged by eslint audit
- Dead `lib/export.js` (zero imports)

### Docs

- Added SECURITY.md
- README honesty pass (production polish), added `publishConfig`, expanded `.gitignore` to cover `.env`

## 1.1.1 -- 2026-04-11

### Changed

- Landing copy: cross-sprint conflict-detection emphasis
- Updated wheat ecosystem chip and added tagline to footer

### Fixed

- DeepWiki docs link (was broken)
- Wheat chip label shortened from "evidence compiler" to "compiler"

### Internal

- Removed JSDoc URLs from `farmer.js`
- Removed `publish.yml` (manual publishing); CI skips publish when the version already exists on npm
- Trimmed npm tarball — removed local-only files from the package

## 1.1.0 -- 2026-04-11

Security hardening release.

### Security

- Path traversal guard added to the static server (Rx-7)
- CSP meta tag added (Rx-6)

### Internal

- Missing runtime files added to `.gitignore` (Rx-10)

## 1.0.4 -- 2026-04-09

### Added

- Orchard-to-Grainulator bridge (Rx-1)
- Grainulator added to the ecosystem grid on the landing page

### Security

- Bearer auth added to `farmer.notify()` and token config (Rx-001)
- `.farmer-token` and runtime files added to `.gitignore` (Rx-003)

### Fixed

- Removed Grainulator from the ecosystem chip grid where it didn't belong
- Node 18 → 20 in CONTRIBUTING and on the landing page

### Docs

- npm badge now shows the full scoped package name

## 1.0.3 -- 2026-03-22

### Fixed

- CI: reverted `type: module` (broke CJS tests); applied Biome lint fixes

## 1.0.2 -- 2026-03-22

### Added

- `--format mermaid` flag for graph output
- Cross-sprint conflict scanner
- Hackathon configuration

### Changed

- Aligned `engines.node` to `>=20`
- DeepWiki badge, static license badge, and `type: module` consistency pass

## 1.0.1 -- 2026-03-20

### Changes

- `orchard serve` now serves the web app dashboard (`public/index.html`) instead of server-generated template HTML
- Removed dead code: `SSE_SCRIPT` injection, `injectSSE()`, unused `buildHtml`/`loadDashboardSprints` imports

## 1.0.0 -- 2026-03-16

Initial release.

- Multi-sprint orchestration with parallel sprint coordination
- Dependency graph tracking between sprints
- Conflict detection across concurrent sprints
- Team assignment and resource allocation
- Timeline visualization with blocking path analysis

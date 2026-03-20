# Changelog

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

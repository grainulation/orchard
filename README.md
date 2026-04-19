<p align="center">
  <img src="site/wordmark.svg" alt="Orchard" width="400">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@grainulation/orchard"><img src="https://img.shields.io/npm/v/@grainulation/orchard?label=%40grainulation%2Forchard" alt="npm version"></a> <a href="https://www.npmjs.com/package/@grainulation/orchard"><img src="https://img.shields.io/npm/dm/@grainulation/orchard" alt="npm downloads"></a> <a href="https://github.com/grainulation/orchard/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license"></a> <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/@grainulation/orchard" alt="node"></a> <a href="https://github.com/grainulation/orchard/actions"><img src="https://github.com/grainulation/orchard/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://deepwiki.com/grainulation/orchard"><img src="https://deepwiki.com/badge.svg" alt="Explore on DeepWiki"></a>
</p>

<p align="center"><strong>Multi-sprint orchestration and dependency tracking.</strong></p>

12 sprints running. One command to see them all. Orchard coordinates parallel research across teams with dependency graphs, conflict detection, and unified dashboards.

## Install

```bash
npm install -g @grainulation/orchard
```

Or use directly:

```bash
npx @grainulation/orchard status
```

## Quick start

Create `orchard.json` in your project root:

```json
{
  "sprints": [
    {
      "path": "./sprints/auth-scaling",
      "question": "How should we scale auth for 10x traffic?",
      "depends_on": [],
      "assigned_to": "alice",
      "deadline": "2026-03-20",
      "status": "active"
    },
    {
      "path": "./sprints/data-migration",
      "question": "What's the safest migration path for the user table?",
      "depends_on": ["./sprints/auth-scaling"],
      "assigned_to": "bob",
      "deadline": "2026-03-25",
      "status": "active"
    }
  ]
}
```

Then:

```bash
orchard plan        # Show the dependency graph
orchard status      # Check status of all sprints
orchard sync        # Sync status from sprint directories
orchard dashboard   # Generate unified HTML dashboard
```

## What it does

- **Sprint dependency graphs** -- "sprint B needs sprint A's results first"
- **Cross-sprint conflict detection** -- when two sprints reach opposing conclusions
- **Team assignment** -- who's running which sprint
- **Unified status dashboard** across all active sprints
- **Sprint scheduling and deadline tracking**
- **Topological sort** -- determines execution order, flags cycles

## CLI

| Command                          | Description                              |
| -------------------------------- | ---------------------------------------- |
| `orchard plan`                   | Show sprint dependency graph             |
| `orchard status`                 | Show status of all tracked sprints       |
| `orchard assign <path> <person>` | Assign a person to a sprint              |
| `orchard sync`                   | Sync sprint states from directories      |
| `orchard dashboard [outfile]`    | Generate unified HTML dashboard          |
| `orchard init`                   | Initialize orchard.json                  |
| `orchard serve`                  | Start the portfolio dashboard web server |

## Conflict detection

Orchard flags two types of cross-sprint conflicts:

1. **Opposing recommendations** -- two sprints make recommendations on the same topic that contradict
2. **Constraint-recommendation tension** -- one sprint's constraints conflict with another's recommendations

## Zero third-party dependencies

Depends only on `@grainulation/barn` (internal ecosystem utilities); no third-party runtime deps. Node built-ins otherwise.

## Part of the grainulation ecosystem

| Tool                                                         | Role                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| [wheat](https://github.com/grainulation/wheat)               | Research engine -- grow structured evidence                 |
| [farmer](https://github.com/grainulation/farmer)             | Permission dashboard -- approve AI actions in real time     |
| [barn](https://github.com/grainulation/barn)                 | Shared tools -- templates, validators, sprint detection     |
| [mill](https://github.com/grainulation/mill)                 | Format conversion -- export to PDF, CSV, slides, 26 formats |
| [silo](https://github.com/grainulation/silo)                 | Knowledge storage -- reusable claim libraries and packs     |
| [harvest](https://github.com/grainulation/harvest)           | Analytics -- cross-sprint patterns and prediction scoring   |
| **orchard**                                                  | Orchestration -- multi-sprint coordination and dependencies |
| [grainulation](https://github.com/grainulation/grainulation) | Unified CLI -- single entry point to the ecosystem          |

## Releases

See [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

MIT

# orchard

> 12 sprints running. One command to see them all.

**Orchard** is the multi-sprint orchestrator for [Wheat](https://github.com/grainulator/wheat) research sprints. It coordinates parallel research across teams with dependency tracking, conflict detection, and unified dashboards.

## Install

```bash
npx @grainulator/orchard status
```

## What it does

- **Run multiple wheat sprints in parallel** with dependency tracking
- **Sprint dependency graphs** -- "sprint B needs sprint A's results first"
- **Team assignment** -- who's running which sprint
- **Resource allocation** -- distribute research bandwidth
- **Cross-sprint conflict detection** -- when two sprints reach opposing conclusions
- **Unified status dashboard** across all active sprints
- **Sprint scheduling and deadline tracking**

## Quick start

Create a `orchard.json` in your project root:

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
# See the dependency graph
orchard plan

# Check status of all sprints
orchard status

# Assign someone to a sprint
orchard assign ./sprints/data-migration carol

# Sync status from sprint directories
orchard sync

# Generate HTML dashboard
orchard dashboard
```

## Commands

| Command | Description |
|---------|-------------|
| `orchard plan` | Show sprint dependency graph as ASCII |
| `orchard status` | Show status of all tracked sprints |
| `orchard assign <path> <person>` | Assign a person to a sprint |
| `orchard sync` | Sync sprint states from their directories |
| `orchard dashboard [outfile]` | Generate unified HTML dashboard |
| `orchard help` | Show help |

## orchard.json schema

```typescript
{
  sprints: Array<{
    path: string;           // Relative path to sprint directory
    question: string;       // The research question
    depends_on: string[];   // Paths of prerequisite sprints
    assigned_to: string;    // Person responsible
    deadline: string;       // ISO date string
    status: string;         // active | done | blocked | not-started
  }>
}
```

## How it works

Orchard reads `orchard.json` for the sprint graph, then scans each sprint directory for `claims.json` and `compilation.json` to determine actual state. It detects conflicts by comparing claims across sprints that share tags.

### Conflict detection

Orchard flags two types of cross-sprint conflicts:

1. **Opposing recommendations** -- two sprints make recommendations on the same topic that may contradict
2. **Constraint-recommendation tension** -- one sprint's constraints conflict with another's recommendations

### Dependency tracking

Sprints can declare dependencies. Orchard uses topological sorting to determine execution order and flags cycles. The `plan` command renders this as ASCII art.

## Zero dependencies

Orchard uses only Node.js built-in modules. No npm install required.

## License

MIT

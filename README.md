# opencode-swarm

Multi-agent collaboration plugin for opencode.

## Features

- **Role-based agents**: planner, coder, reviewer, tester, documenter
- **Parallel execution**: Agents work simultaneously on independent tasks
- **Dependency tracking**: Planner determines sequential vs parallel per task
- **State coordination**: SQLite-based state for inter-agent communication
- **Context handoff**: Incremental context + handoff files for persistence
- **Result aggregation**: Unified summary of all agent outputs

## Installation

```bash
# Add to opencode.json
{
  "plugins": ["opencode-swarm"]
}
```

Or for local development:

```bash
cd opencode-swarm
npm install
```

## Usage

### Start a Swarm

```
/swarm Implement user authentication for our API
```

### Spawn Agents Manually

```
Use swarm-spawn tool with role and task description
```

### Check Status

```
/swarm-status
```

### Abort Swarm

```
/swarm-abort
```

## Architecture

```
src/
├── index.ts        # Plugin entry point
├── types.ts        # TypeScript types
├── commands/       # CLI commands
├── tools/          # Custom tools
├── lib/
│   ├── state.ts     # SQLite state management
│   ├── roles.ts    # Role definitions
│   ├── coordinator.ts # Agent orchestration
│   └── aggregator.ts # Result collection
└── events.ts       # Session event handlers
```

## State Database

Located at `.opencode/swarm/{swarmId}/state.db`:

- `agents` - Agent status, role, progress
- `tasks` - Task definitions with dependencies
- `events` - Timestamped event log

## Requirements

- opencode >= 1.0.0
- better-sqlite3
- @opencode-ai/sdk

## License

MIT

## CI and Fleet-mode Testing

A GitHub Actions workflow is provided at `.github/workflows/fleet-ci.yml` that runs Vitest for the `opencode-swarm` package.

Recommended CI steps:

1. Checkout repository
2. Setup Node.js (18.x or 20.x)
3. Install dependencies: `cd opencode-swarm && npm ci`
4. Run tests: `cd opencode-swarm && npm run test:run`

The workflow uploads Vitest results as an artifact. Locally you can run the same commands to validate fleet-mode scenarios.


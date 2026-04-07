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
│   ├── state.ts     # State management (JSON-based)
│   ├── roles.ts    # Role definitions
│   ├── coordinator-manager.ts # Swarm orchestration
│   └── aggregator.ts # Result collection
└── events.ts       # Session event handlers
```

## State Database

Located at `.opencode/swarm/{swarmId}.db` (JSON file):

- `swarm` - Swarm metadata, status, planner session
- `agents` - Agent status, role, progress
- `tasks` - Task definitions with dependencies
- `events` - Timestamped event log

## Requirements

- opencode >= 1.0.0
- @opencode-ai/sdk
- @opencode-ai/plugin

## License

MIT

## Testing

Run tests with:

```bash
cd opencode-swarm
npm ci
npm run test:run
```

Tests are located under `src/__tests__` and include integration tests that simulate swarm operations with mocked SDK clients.


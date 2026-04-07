# opencode-swarm

Multi-agent collaboration plugin for opencode. Enables multiple agents to work together on complex tasks.

## Overview

opencode-swarm allows you to spawn multiple AI agents with specific roles (coder, reviewer, tester, etc.) that can work in parallel on different parts of a task. The planner agent coordinates the work and aggregates results.

## Roles

- **planner**: Breaks down tasks, identifies dependencies, coordinates workflow
- **coder**: Implements features, follows project conventions
- **reviewer**: Reviews for bugs, security, code quality
- **tester**: Writes unit and integration tests
- **documenter**: Creates and maintains documentation

## Available Tools

- `swarm-spawn <role> <task> [context]` - Spawn a worker agent
- `swarm-broadcast <message>` - Send message to all agents
- `swarm-progress <0-1> [message]` - Report task progress
- `swarm-complete <result> [files]` - Mark task complete
- `swarm-handoff <taskId> <context> [files] [decisions]` - Prepare handoff to another agent
- `swarm-status` - Show swarm/agent status

## Available Commands

- `/swarm <task>` - Start a new swarm session
- `/swarm-status` - Show current swarm status
- `/swarm-abort` - Cancel active swarm

## State Storage

Swarm state is stored in `.opencode/swarm/{swarmId}/`:
- `state.db` - SQLite database with agents, tasks, events
- `{taskId}/handoff.md` - Handoff context files

## Usage Example

```
/swarm Implement user authentication for our API. Needs login, logout, token refresh.
```

The planner will decompose this into subtasks and spawn appropriate agents.

## Configuration

```json
{
  "swarm": {
    "roles": { ... },
    "maxAgents": 5,
    "defaultTimeout": 300
  }
}
```

## CI and Fleet-mode Testing

We include a CI workflow and tests that simulate fleet-style runs (multiple swarms running concurrently). Recommended CI steps:

- Run on push and pull_request against main
- Install dependencies in opencode-swarm with `npm ci`
- Run tests with `npm run test:run` (uses Vitest)

Example local run:

```bash
cd opencode-swarm
npm ci
npm run test:run
```

Tests are located under `src/__tests__` and include fleet-mode simulations that create multiple swarms, spawn agents, report progress, and aggregate results. These tests mock the SDK session calls so they are deterministic and fast.


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

Swarm state is stored in `.opencode/swarm/{swarmId}.db` (JSON file):
- `{swarmId}.db` - Swarm state with agents, tasks, events
- `{taskId}/handoff.md` - Handoff context files

## CI and Testing

Run tests with:

```bash
cd opencode-swarm
npm ci
npm run test:run
```

Tests include integration tests that simulate swarm operations with mocked SDK clients.


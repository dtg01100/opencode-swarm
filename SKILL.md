# opencode-swarm

Multi-agent collaboration plugin for opencode. Enables multiple agents to work together on complex tasks with hierarchical swarm orchestration.

## Overview

opencode-swarm allows you to spawn multiple AI agents with specific roles (planner, coder, reviewer, tester, documenter) that can work in parallel on different parts of a task. The planner agent coordinates the work and aggregates results. Sub-swarms can spawn independent work streams that report back to the parent.

## Architecture

- **Swarm**: A coordination unit with a planner agent and multiple worker agents
- **Subswarm**: An independent swarm spawned by a parent swarm for parallel work
- **Parent/Child**: Hierarchical relationship where a child reports results back to its parent via handoff files

## Roles

- **planner**: Breaks down tasks, identifies dependencies, coordinates workflow, spawns subswarms
- **coder**: Implements features, follows project conventions
- **reviewer**: Reviews for bugs, security, code quality
- **tester**: Writes unit and integration tests
- **documenter**: Creates and maintains documentation
- **worker**: General-purpose agent for any task

## Commands

- `/swarm <task>` - Start a new swarm session
- `/swarm-status` - Show current swarm status
- `/swarm-abort` - Cancel active swarm

## Swarm Tools

### Core Tools

| Tool | Description |
|------|-------------|
| `swarm-spawn` | Spawn a new agent (planner, coder, reviewer, tester, documenter, worker) |
| `swarm-progress` | Report progress on current task |
| `swarm-complete` | Mark task complete with result |
| `swarm-handoff` | Pass context/files/decisions to next agent |
| `swarm-broadcast` | Send message to all agents |
| `swarm-status` | Get current swarm status |
| `swarm-abort` | Abort the current swarm |

### Subswarm Tools

| Tool | Description |
|------|-------------|
| `swarm-subswarm` | Spawn an independent sub-swarm for parallel work |
| `swarm-poll` | Poll a subswarm for completion (non-blocking) |
| `swarm-abandon` | Stop tracking a subswarm without aborting it |
| `swarm-todotree` | Get recursive view of swarm + all subswarms |
| `swarm-parent-context` | Read parent's handoff context (for subswarms) |

### Utility Tools

| Tool | Description |
|------|-------------|
| `swarm-init` | Initialize a new swarm for a task |
| `swarm-resource-status` | Check system memory/load before spawning |
| `swarm-abort-subswarm` | Abort a specific subswarm |

## Subswarm Workflow

1. Parent spawns a subswarm for independent work:
```
swarm-subswarm({
  parentSwarmId: "parent-id",
  taskDescription: "Implement feature X",
  parentSessionId: "session-id",
  parentHandoffPath: ".opencode/swarm/parent-id/handoff.md",
  timeoutMs: 60000  // optional
})
// Returns: { swarmId, plannerAgentId }
```

2. Parent continues other work while child runs

3. Parent polls for completion:
```
swarm-poll({ swarmId: "child-id" })
// Returns: { status, childHandoff, propagatedResults, timedOut, ... }
```

4. Child's results are propagated to parent's handoff file when child completes

## Todotree

View the full hierarchical task tree:
```
swarm-todotree({ swarmId: "swarm-id", maxDepth: 10 })
// Returns:
{
  swarmId: "...",
  status: "executing",
  agents: [{ id, role, status, progress }],
  tasks: [{ id, description, status, progress }],
  children: [
    { swarmId: "...", status: "...", agents: [...], tasks: [...], children: [...] }
  ]
}
```

## State Storage

Swarm state is stored in `.opencode/swarm/{swarmId}.db` (JSON file):
- `{swarmId}.db` - Swarm state with agents, tasks, events
- `{swarmId}/handoff.md` - Handoff context file

## CI and Testing

Run tests with:

```bash
cd opencode-swarm
npm ci
npm run test:run
```

Tests include integration tests that simulate swarm operations with mocked SDK clients.

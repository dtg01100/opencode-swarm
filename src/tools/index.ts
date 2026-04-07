import { tool } from '@opencode-ai/plugin';
import type { Plugin, ToolContext } from '@opencode-ai/plugin';
import { coordinatorManager } from '../lib/coordinator-manager.js';
import type { AgentRole } from '../types.js';

let pluginContext: Parameters<Plugin>[0] | null = null;

export function setPluginContext(ctx: Parameters<Plugin>[0]): void {
  pluginContext = ctx;
}

// Helper to create JSON string response for tools
function jsonResponse(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}

export const swarmSpawnTool = tool({
  description: 'Spawn a new worker agent with a specific role to execute a task',
  args: {
    role: tool.schema.string(),
    taskId: tool.schema.string(),
    context: tool.schema.string().optional(),
    parentSessionId: tool.schema.string().optional(),
  },
  async execute(args, _context: ToolContext) {
    const role = args.role as AgentRole;
    const coordinator = coordinatorManager.getCoordinator();

    if (!coordinator) {
      return jsonResponse({ success: false, error: 'No active swarm. Use /swarm to start one.' });
    }

    if (!args.taskId) {
      return jsonResponse({ success: false, error: 'taskId is required for agent spawning' });
    }

    try {
      const agent = await coordinator.spawnAgent({
        role,
        taskId: args.taskId,
        context: args.context,
        parentSessionId: args.parentSessionId,
      });

      return jsonResponse({
        success: true,
        agentId: agent.id,
        role: agent.role,
        status: agent.status,
        message: `Spawned ${role} agent for task ${args.taskId}`,
      });
    } catch (error) {
      return jsonResponse({ success: false, error: `Failed to spawn agent: ${error instanceof Error ? error.message : String(error)}` });
    }
  },
});

export const swarmBroadcastTool = tool({
  description: 'Send a message to all active swarm agents',
  args: {
    message: tool.schema.string(),
    fromAgentId: tool.schema.string().optional(),
  },
  async execute(args, _context: ToolContext) {
    const coordinator = coordinatorManager.getCoordinator();

    if (!coordinator) {
      return jsonResponse({ success: false, error: 'No active swarm.' });
    }

    try {
      await coordinatorManager.broadcast(args.message, args.fromAgentId);
      return jsonResponse({
        success: true,
        message: `Broadcast sent: ${args.message}`,
      });
    } catch (error) {
      return jsonResponse({ success: false, error: String(error) });
    }
  },
});

export const swarmProgressTool = tool({
  description: 'Report progress on the current task',
  args: {
    agentId: tool.schema.string(),
    progress: tool.schema.number().min(0).max(1),
    message: tool.schema.string().optional(),
  },
  async execute(args, _context: ToolContext) {
    const coordinator = coordinatorManager.getCoordinator();

    if (!coordinator) {
      return jsonResponse({ success: false, error: 'No active swarm.' });
    }

    try {
      await coordinatorManager.reportProgress({
        agentId: args.agentId,
        progress: args.progress,
        message: args.message,
      });

      return jsonResponse({
        success: true,
        progress: Math.round(args.progress * 100),
        message: args.message ?? `Progress: ${Math.round(args.progress * 100)}%`,
      });
    } catch (error) {
      return jsonResponse({ success: false, error: String(error) });
    }
  },
});

export const swarmCompleteTool = tool({
  description: 'Mark the current task as complete and report results',
  args: {
    agentId: tool.schema.string(),
    result: tool.schema.string(),
    files: tool.schema.array(tool.schema.string()).optional(),
  },
  async execute(args, _context: ToolContext) {
    const coordinator = coordinatorManager.getCoordinator();

    if (!coordinator) {
      return jsonResponse({ success: false, error: 'No active swarm.' });
    }

    try {
      await coordinatorManager.completeCurrentAgent(args.agentId, args.result);

      const status = coordinatorManager.getSwarmStatus();

      return jsonResponse({
        success: true,
        result: args.result,
        files: args.files ?? [],
        swarmComplete: coordinatorManager.isSwarmComplete(),
        hasFailures: coordinatorManager.hasFailedTasks(),
        agentCount: status?.agents.length ?? 0,
        message: `Task complete. Result: ${args.result}`,
      });
    } catch (error) {
      return jsonResponse({ success: false, error: String(error) });
    }
  },
});

export const swarmHandoffTool = tool({
  description: 'Hand off work to another agent with accumulated context',
  args: {
    taskId: tool.schema.string(),
    fromAgentId: tool.schema.string(),
    context: tool.schema.string(),
    files: tool.schema.array(tool.schema.string()).optional(),
    decisions: tool.schema.array(tool.schema.string()).optional(),
    toAgentId: tool.schema.string().optional(),
  },
  async execute(args, _context: ToolContext) {
    const coordinator = coordinatorManager.getCoordinator();

    if (!coordinator) {
      return jsonResponse({ success: false, error: 'No active swarm.' });
    }

    try {
      await coordinatorManager.handleHandoff({
        taskId: args.taskId,
        fromAgentId: args.fromAgentId,
        toAgentId: args.toAgentId,
        context: args.context,
        files: args.files ?? [],
        decisions: args.decisions ?? [],
      });

      return jsonResponse({
        success: true,
        taskId: args.taskId,
        message: `Handoff prepared for task ${args.taskId}`,
      });
    } catch (error) {
      return jsonResponse({ success: false, error: String(error) });
    }
  },
});

export const swarmStatusTool = tool({
  description: 'Get the current status of the swarm and all agents',
  args: {},
  async execute(_args, _context: ToolContext) {
    const coordinator = coordinatorManager.getCoordinator();

    if (!coordinator) {
      return jsonResponse({ success: false, error: 'No active swarm.' });
    }

    const status = coordinatorManager.getSwarmStatus();

    if (!status) {
      return jsonResponse({ success: false, error: 'Could not retrieve swarm status.' });
    }

    const lines: string[] = ['## Swarm Status'];

    if (status.swarm) {
      lines.push(`Swarm ID: ${status.swarm.id.substring(0, 8)}`);
      lines.push(`Status: ${status.swarm.status}`);
      lines.push(`Created: ${new Date(status.swarm.createdAt).toISOString()}`);
    }

    lines.push(`\n### Agents (${status.agents.length})`);
    for (const agent of status.agents) {
      const icon = agent.status === 'completed' ? '✅' : agent.status === 'failed' ? '❌' : agent.status === 'running' ? '🔄' : '⏳';
      lines.push(`${icon} ${agent.role} - ${agent.status} (${Math.round(agent.progress * 100)}%)`);
    }

    lines.push(`\n### Tasks (${status.tasks.length})`);
    for (const task of status.tasks) {
      const icon = task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : task.status === 'in_progress' ? '🔄' : '⏳';
      lines.push(`${icon} ${task.description.substring(0, 50)}${task.description.length > 50 ? '...' : ''}`);
    }

    return jsonResponse({
      success: true,
      swarm: status.swarm,
      agents: status.agents,
      tasks: status.tasks,
      summary: lines.join('\n'),
    });
  },
});

export const swarmAbortTool = tool({
  description: 'Abort the current swarm and all agents',
  args: {},
  async execute(_args, _context: ToolContext) {
    const coordinator = coordinatorManager.getCoordinator();

    if (!coordinator) {
      return jsonResponse({ success: false, error: 'No active swarm.' });
    }

    try {
      await coordinatorManager.abortSwarm();
      return jsonResponse({
        success: true,
        message: 'Swarm aborted',
      });
    } catch (error) {
      return jsonResponse({ success: false, error: String(error) });
    }
  },
});

export const swarmInitTool = tool({
  description: 'Initialize a new swarm for a task',
  args: {
    taskDescription: tool.schema.string(),
    sessionId: tool.schema.string(),
  },
  async execute(args, _context: ToolContext) {
    try {
      const { swarmId, plannerAgentId } = await coordinatorManager.initSwarmForTask(
        args.taskDescription,
        args.sessionId
      );

      return jsonResponse({
        success: true,
        swarmId,
        plannerAgentId,
        message: `Swarm ${swarmId.substring(0, 8)} initialized with planner agent`,
      });
    } catch (error) {
      return jsonResponse({ success: false, error: String(error) });
    }
  },
});

export const swarmTools = {
  'swarm-spawn': swarmSpawnTool,
  'swarm-broadcast': swarmBroadcastTool,
  'swarm-progress': swarmProgressTool,
  'swarm-complete': swarmCompleteTool,
  'swarm-handoff': swarmHandoffTool,
  'swarm-status': swarmStatusTool,
  'swarm-abort': swarmAbortTool,
  'swarm-init': swarmInitTool,
};

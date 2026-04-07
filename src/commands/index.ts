import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import { coordinatorManager } from '../lib/coordinator-manager.js';

// Extended context type that includes properties expected by the plugin
interface SwarmPluginContext extends PluginInput {
  client: PluginInput['client'] & {
    session: PluginInput['client']['session'] & {
      id: string;
    };
    tui: {
      onCommand: (name: string, handler: (args: string, ctx: SwarmPluginContext) => Promise<{ success: boolean; message: string }>) => void;
    };
  };
}

function getSessionId(ctx: SwarmPluginContext): string {
  // Try to get session ID from client, fallback to 'unknown'
  return (ctx.client as any).session?.id ?? 'unknown';
}

export const swarmCommands = {
  '/swarm': {
    description: 'Start a multi-agent swarm session',
    usage: '/swarm <task description>',
    handler: async (args: string, ctx: SwarmPluginContext) => {
      if (!args.trim()) {
        return {
          success: false,
          message: 'Usage: /swarm <task description>\nExample: /swarm Implement user authentication for our API',
        };
      }

      // Sanitize the task description to prevent injection
      const sanitizedArgs = args.trim().substring(0, 1000);

      try {
        const sessionId = getSessionId(ctx);
        const { swarmId, plannerAgentId } = await coordinatorManager.initSwarmForTask(sanitizedArgs, sessionId);

        return {
          success: true,
          message: `Swarm started!\nSwarm ID: ${swarmId.substring(0, 8)}\nPlanner agent: ${plannerAgentId.substring(0, 8)}\nTask: ${sanitizedArgs}`,
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to start swarm: ${error}`,
        };
      }
    },
  },
  '/fleet-start': {
    description: 'Start a fleet of swarms for the given task',
    usage: '/fleet-start <task description>',
    handler: async (args: string, ctx: SwarmPluginContext) => {
      if (!args.trim()) {
        return {
          success: false,
          message: 'Usage: /fleet-start <task description>\nExample: /fleet-start Run compatibility tests across multiple platforms',
        };
      }

      const sanitizedArgs = args.trim().substring(0, 1000);

      try {
        const sessionId = getSessionId(ctx);
        const res = await coordinatorManager.startFleetForTask(sanitizedArgs, sessionId);
        return {
          success: true,
          message: `Fleet started!\nFleet ID: ${String(res.fleetId).substring(0, 8)}\nSwarms: ${res.swarms?.length ?? 0}\nTask: ${sanitizedArgs}`,
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to start fleet: ${error}`,
        };
      }
    },
  },
  '/fleet-status': {
    description: 'Show status for a fleet',
    usage: '/fleet-status <fleetId>',
    handler: async (args: string, ctx: SwarmPluginContext) => {
      const fleetId = args.trim();
      if (!fleetId) {
        return { success: false, message: 'Usage: /fleet-status <fleetId>' };
      }

      // Validate fleetId format to prevent injection
      if (!/^[a-zA-Z0-9-]+$/.test(fleetId)) {
        return { success: false, message: 'Invalid fleetId: must contain only alphanumeric characters and hyphens' };
      }

      try {
        const status = await coordinatorManager.getFleetStatus(fleetId);
        if (!status) {
          return { success: false, message: `No fleet found with id ${fleetId}` };
        }

        const lines: string[] = [`## Fleet ${fleetId.substring(0, 8)} Status`];
        lines.push(`**Swarms:** ${status.swarms.length}`);
        lines.push(`**Total agents:** ${status.totalAgents}`);
        lines.push(`**Agents running:** ${status.runningAgents}`);
        lines.push(`**Agents completed:** ${status.completedAgents}`);
        lines.push(`**Failed tasks:** ${status.failedTasks}`);

        return { success: true, message: lines.join('\n') };
      } catch (error) {
        return { success: false, message: `Failed to fetch fleet status: ${error}` };
      }
    },
  },
  '/fleet-stop': {
    description: 'Stop a fleet and abort all contained swarms',
    usage: '/fleet-stop <fleetId>',
    handler: async (args: string, ctx: SwarmPluginContext) => {
      const fleetId = args.trim();
      if (!fleetId) {
        return { success: false, message: 'Usage: /fleet-stop <fleetId>' };
      }

      if (!/^[a-zA-Z0-9-]+$/.test(fleetId)) {
        return { success: false, message: 'Invalid fleetId: must contain only alphanumeric characters and hyphens' };
      }

      try {
        await coordinatorManager.stopFleet(fleetId);
        return { success: true, message: `Fleet ${fleetId.substring(0, 8)} stopped.` };
      } catch (error) {
        return { success: false, message: `Failed to stop fleet: ${error}` };
      }
    },
  },
  '/swarm-status': {
    description: 'Show current swarm status (includes fleet aggregates when available)',
    usage: '/swarm-status',
    handler: async (args: string, ctx: SwarmPluginContext) => {
      const status = coordinatorManager.getSwarmStatus();

      if (!status) {
        return {
          success: false,
          message: 'No active swarm. Use /swarm to start one.',
        };
      }

      const lines: string[] = ['## Swarm Status'];

      if (status.swarm) {
        lines.push(`**Swarm ID:** ${status.swarm.id.substring(0, 8)}`);
        lines.push(`**Status:** ${status.swarm.status}`);
        lines.push(`**Created:** ${new Date(status.swarm.createdAt).toLocaleString()}`);
      }

      // Fleet-level aggregates when available
      try {
        const fleetAgg = coordinatorManager.getFleetAggregates?.();
        if (fleetAgg) {
          lines.push('\n### Fleet aggregates');
          lines.push(`**Fleets:** ${fleetAgg.fleetCount}`);
          lines.push(`**Total swarms:** ${fleetAgg.totalSwarms}`);
          lines.push(`**Total agents:** ${fleetAgg.totalAgents}`);
          lines.push(`**Agents running:** ${fleetAgg.runningAgents}`);
          lines.push(`**Agents completed:** ${fleetAgg.completedAgents}`);
          lines.push(`**Failed tasks:** ${fleetAgg.failedTasks}`);
        }
      } catch {
        // ignore missing implementation
      }

      lines.push('\n### Agents');
      if (status.agents.length === 0) {
        lines.push('_No agents spawned yet_');
      } else {
        for (const agent of status.agents) {
          const icon = agent.status === 'completed' ? '✅' : agent.status === 'failed' ? '❌' : agent.status === 'running' ? '🔄' : '⏳';
          lines.push(`${icon} **${agent.role}** - ${agent.status} (${Math.round(agent.progress * 100)}%)`);
        }
      }

      lines.push('\n### Tasks');
      if (status.tasks.length === 0) {
        lines.push('_No tasks created yet_');
      } else {
        for (const task of status.tasks) {
          const icon = task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : task.status === 'in_progress' ? '🔄' : '⏳';
          lines.push(`${icon} ${task.description}`);
        }
      }

      return {
        success: true,
        message: lines.join('\n'),
      };
    },
  },
  '/swarm-abort': {
    description: 'Abort the current swarm and all agents',
    usage: '/swarm-abort',
    handler: async (args: string, ctx: SwarmPluginContext) => {
      const coordinator = coordinatorManager.getCoordinator();

      if (!coordinator) {
        return {
          success: false,
          message: 'No active swarm to abort.',
        };
      }

      try {
        await coordinatorManager.abortSwarm();
        return {
          success: true,
          message: 'Swarm aborted. All agents have been stopped.',
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to abort swarm: ${error}`,
        };
      }
    },
  },
};

// Commands storage for registration with TUI
const registeredCommands: Map<string, (args: string, ctx: SwarmPluginContext) => Promise<{ success: boolean; message: string }>> = new Map();

export function registerCommands(ctx: SwarmPluginContext): void {
  for (const [name, command] of Object.entries(swarmCommands)) {
    registeredCommands.set(name, command.handler);

    // Register with TUI if available
    if (ctx.client.tui?.onCommand) {
      ctx.client.tui.onCommand(name, command.handler);
    }
  }
}

export { registeredCommands };

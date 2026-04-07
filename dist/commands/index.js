import { coordinatorManager } from '../lib/coordinator-manager.js';
function getSessionId(ctx) {
    // Try to get session ID from client, fallback to 'unknown'
    return ctx.client.session?.id ?? 'unknown';
}
export const swarmCommands = {
    '/swarm': {
        description: 'Start a multi-agent swarm session',
        usage: '/swarm <task description>',
        handler: async (args, ctx) => {
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
            }
            catch (error) {
                return {
                    success: false,
                    message: `Failed to start swarm: ${error}`,
                };
            }
        },
    },
    '/swarm-status': {
        description: 'Show current swarm status',
        usage: '/swarm-status',
        handler: async (args, ctx) => {
            const status = coordinatorManager.getSwarmStatus();
            if (!status) {
                return {
                    success: false,
                    message: 'No active swarm. Use /swarm to start one.',
                };
            }
            const lines = ['## Swarm Status'];
            if (status.swarm) {
                lines.push(`**Swarm ID:** ${status.swarm.id.substring(0, 8)}`);
                lines.push(`**Status:** ${status.swarm.status}`);
                lines.push(`**Created:** ${new Date(status.swarm.createdAt).toLocaleString()}`);
            }
            lines.push('\n### Agents');
            if (status.agents.length === 0) {
                lines.push('_No agents spawned yet_');
            }
            else {
                for (const agent of status.agents) {
                    const icon = agent.status === 'completed' ? '✅' : agent.status === 'failed' ? '❌' : agent.status === 'running' ? '🔄' : '⏳';
                    lines.push(`${icon} **${agent.role}** - ${agent.status} (${Math.round(agent.progress * 100)}%)`);
                }
            }
            lines.push('\n### Tasks');
            if (status.tasks.length === 0) {
                lines.push('_No tasks created yet_');
            }
            else {
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
        handler: async (args, ctx) => {
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
            }
            catch (error) {
                return {
                    success: false,
                    message: `Failed to abort swarm: ${error}`,
                };
            }
        },
    },
};
// Commands storage for registration with TUI
const registeredCommands = new Map();
export function registerCommands(ctx) {
    for (const [name, command] of Object.entries(swarmCommands)) {
        registeredCommands.set(name, command.handler);
        // Register with TUI if available
        if (ctx.client.tui?.onCommand) {
            ctx.client.tui.onCommand(name, command.handler);
        }
    }
}
export { registeredCommands };

import type { Plugin } from '@opencode-ai/plugin';
import { swarmTools, setPluginContext } from './tools/index.js';
import { setupEventHandlers } from './events.js';
import { registerCommands } from './commands/index.js';
import { coordinatorManager } from './lib/coordinator-manager.js';

// Use any for context to avoid complex type conflicts with plugin API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContext = any;

export const opencodeSwarmPlugin: Plugin = async (ctx: AnyContext) => {
  const basePath = '.opencode/swarm';

  coordinatorManager.setBasePath(basePath);
  coordinatorManager.setClient(ctx.client);

  setPluginContext(ctx);

  // Log initialization if app.log is available
  if (ctx?.client?.app?.log) {
    await ctx.client.app.log({
      body: {
        service: 'opencode-swarm',
        level: 'info',
        message: 'opencode-swarm plugin initialized',
      },
    });
  }

  // Setup event handlers and get the event hook
  const eventHandlers = setupEventHandlers(ctx, coordinatorManager);

  // Register commands
  registerCommands(ctx);

  return {
    tool: swarmTools,
    ...eventHandlers,
  };
};

export default opencodeSwarmPlugin;

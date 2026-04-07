import type { Event } from '@opencode-ai/sdk';
import { CoordinatorManager } from './lib/coordinator-manager.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContext = any;

export function setupEventHandlers(ctx: AnyContext, coordinatorManager: CoordinatorManager): { event?: (input: { event: Event }) => Promise<void> } {
  // Return an event handler compatible with the Plugin hooks API
  // The event hook receives events and dispatches to the appropriate handlers
  return {
    event: async (input: { event: Event }) => {
      const event = input.event as any;
      const sessionId = (event?.properties?.sessionId ?? event?.sessionId ?? '') as string;

      if (isSwarmSession(sessionId)) {
        switch (event.type) {
          case 'session.created':
            await trackAgentForSwarm(sessionId, ctx);
            break;
          case 'session.idle':
            await handleAgentIdle(sessionId, ctx);
            break;
          case 'session.error':
            await handleAgentError(sessionId, ctx);
            break;
          case 'session.compacted':
            await preserveSwarmContext(sessionId, ctx);
            break;
          default:
            // Other events - could log or handle as needed
            break;
        }
      }
    },
  };
}

function isSwarmSession(sessionId: string): boolean {
  return sessionId.includes('[swarm]');
}

async function trackAgentForSwarm(sessionId: string, ctx: AnyContext) {
  if (ctx?.client?.app?.log) {
    await ctx.client.app.log({
      body: {
        service: 'opencode-swarm',
        level: 'info',
        message: `Swarm agent started: ${sessionId}`,
      },
    });
  }
}

async function handleAgentIdle(sessionId: string, ctx: AnyContext) {
  if (ctx?.client?.app?.log) {
    await ctx.client.app.log({
      body: {
        service: 'opencode-swarm',
        level: 'info',
        message: `Swarm agent completed: ${sessionId}`,
      },
    });
  }
}

async function handleAgentError(sessionId: string, ctx: AnyContext) {
  if (ctx?.client?.app?.log) {
    await ctx.client.app.log({
      body: {
        service: 'opencode-swarm',
        level: 'error',
        message: `Swarm agent error: ${sessionId}`,
      },
    });
  }
}

async function preserveSwarmContext(sessionId: string, ctx: AnyContext) {
  if (ctx?.client?.app?.log) {
    await ctx.client.app.log({
      body: {
        service: 'opencode-swarm',
        level: 'info',
        message: `Preserving swarm context for: ${sessionId}`,
      },
    });
  }
}

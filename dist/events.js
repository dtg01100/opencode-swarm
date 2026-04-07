export function setupEventHandlers(ctx, coordinatorManager) {
    // Return an event handler compatible with the Plugin hooks API
    // The event hook receives events and dispatches to the appropriate handlers
    return {
        event: async (input) => {
            const event = input.event;
            const sessionId = (event?.properties?.sessionId ?? event?.sessionId ?? '');
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
function isSwarmSession(sessionId) {
    return sessionId.includes('[swarm]');
}
async function trackAgentForSwarm(sessionId, ctx) {
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
async function handleAgentIdle(sessionId, ctx) {
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
async function handleAgentError(sessionId, ctx) {
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
async function preserveSwarmContext(sessionId, ctx) {
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

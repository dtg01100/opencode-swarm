import type { PluginInput } from '@opencode-ai/plugin';
interface SwarmPluginContext extends PluginInput {
    client: PluginInput['client'] & {
        session: PluginInput['client']['session'] & {
            id: string;
        };
        tui: {
            onCommand: (name: string, handler: (args: string, ctx: SwarmPluginContext) => Promise<{
                success: boolean;
                message: string;
            }>) => void;
        };
    };
}
export declare const swarmCommands: {
    '/swarm': {
        description: string;
        usage: string;
        handler: (args: string, ctx: SwarmPluginContext) => Promise<{
            success: boolean;
            message: string;
        }>;
    };
    '/swarm-status': {
        description: string;
        usage: string;
        handler: (args: string, ctx: SwarmPluginContext) => Promise<{
            success: boolean;
            message: string;
        }>;
    };
    '/swarm-abort': {
        description: string;
        usage: string;
        handler: (args: string, ctx: SwarmPluginContext) => Promise<{
            success: boolean;
            message: string;
        }>;
    };
};
declare const registeredCommands: Map<string, (args: string, ctx: SwarmPluginContext) => Promise<{
    success: boolean;
    message: string;
}>>;
export declare function registerCommands(ctx: SwarmPluginContext): void;
export { registeredCommands };

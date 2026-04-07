import type { Plugin, ToolContext } from '@opencode-ai/plugin';
export declare function setPluginContext(ctx: Parameters<Plugin>[0]): void;
export declare const swarmSpawnTool: {
    description: string;
    args: {
        role: import("zod").ZodString;
        taskId: import("zod").ZodString;
        context: import("zod").ZodOptional<import("zod").ZodString>;
        parentSessionId: import("zod").ZodOptional<import("zod").ZodString>;
    };
    execute(args: {
        role: string;
        taskId: string;
        context?: string | undefined;
        parentSessionId?: string | undefined;
    }, context: ToolContext): Promise<string>;
};
export declare const swarmBroadcastTool: {
    description: string;
    args: {
        message: import("zod").ZodString;
        fromAgentId: import("zod").ZodOptional<import("zod").ZodString>;
    };
    execute(args: {
        message: string;
        fromAgentId?: string | undefined;
    }, context: ToolContext): Promise<string>;
};
export declare const swarmProgressTool: {
    description: string;
    args: {
        agentId: import("zod").ZodString;
        progress: import("zod").ZodNumber;
        message: import("zod").ZodOptional<import("zod").ZodString>;
    };
    execute(args: {
        agentId: string;
        progress: number;
        message?: string | undefined;
    }, context: ToolContext): Promise<string>;
};
export declare const swarmCompleteTool: {
    description: string;
    args: {
        agentId: import("zod").ZodString;
        result: import("zod").ZodString;
        files: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
    };
    execute(args: {
        agentId: string;
        result: string;
        files?: string[] | undefined;
    }, context: ToolContext): Promise<string>;
};
export declare const swarmHandoffTool: {
    description: string;
    args: {
        taskId: import("zod").ZodString;
        fromAgentId: import("zod").ZodString;
        context: import("zod").ZodString;
        files: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
        decisions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
        toAgentId: import("zod").ZodOptional<import("zod").ZodString>;
    };
    execute(args: {
        taskId: string;
        fromAgentId: string;
        context: string;
        files?: string[] | undefined;
        decisions?: string[] | undefined;
        toAgentId?: string | undefined;
    }, context: ToolContext): Promise<string>;
};
export declare const swarmStatusTool: {
    description: string;
    args: {};
    execute(args: Record<string, never>, context: ToolContext): Promise<string>;
};
export declare const swarmAbortTool: {
    description: string;
    args: {};
    execute(args: Record<string, never>, context: ToolContext): Promise<string>;
};
export declare const swarmInitTool: {
    description: string;
    args: {
        taskDescription: import("zod").ZodString;
        sessionId: import("zod").ZodString;
    };
    execute(args: {
        taskDescription: string;
        sessionId: string;
    }, context: ToolContext): Promise<string>;
};
export declare const swarmTools: {
    'swarm-spawn': {
        description: string;
        args: {
            role: import("zod").ZodString;
            taskId: import("zod").ZodString;
            context: import("zod").ZodOptional<import("zod").ZodString>;
            parentSessionId: import("zod").ZodOptional<import("zod").ZodString>;
        };
        execute(args: {
            role: string;
            taskId: string;
            context?: string | undefined;
            parentSessionId?: string | undefined;
        }, context: ToolContext): Promise<string>;
    };
    'swarm-broadcast': {
        description: string;
        args: {
            message: import("zod").ZodString;
            fromAgentId: import("zod").ZodOptional<import("zod").ZodString>;
        };
        execute(args: {
            message: string;
            fromAgentId?: string | undefined;
        }, context: ToolContext): Promise<string>;
    };
    'swarm-progress': {
        description: string;
        args: {
            agentId: import("zod").ZodString;
            progress: import("zod").ZodNumber;
            message: import("zod").ZodOptional<import("zod").ZodString>;
        };
        execute(args: {
            agentId: string;
            progress: number;
            message?: string | undefined;
        }, context: ToolContext): Promise<string>;
    };
    'swarm-complete': {
        description: string;
        args: {
            agentId: import("zod").ZodString;
            result: import("zod").ZodString;
            files: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
        };
        execute(args: {
            agentId: string;
            result: string;
            files?: string[] | undefined;
        }, context: ToolContext): Promise<string>;
    };
    'swarm-handoff': {
        description: string;
        args: {
            taskId: import("zod").ZodString;
            fromAgentId: import("zod").ZodString;
            context: import("zod").ZodString;
            files: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
            decisions: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
            toAgentId: import("zod").ZodOptional<import("zod").ZodString>;
        };
        execute(args: {
            taskId: string;
            fromAgentId: string;
            context: string;
            files?: string[] | undefined;
            decisions?: string[] | undefined;
            toAgentId?: string | undefined;
        }, context: ToolContext): Promise<string>;
    };
    'swarm-status': {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: ToolContext): Promise<string>;
    };
    'swarm-abort': {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: ToolContext): Promise<string>;
    };
    'swarm-init': {
        description: string;
        args: {
            taskDescription: import("zod").ZodString;
            sessionId: import("zod").ZodString;
        };
        execute(args: {
            taskDescription: string;
            sessionId: string;
        }, context: ToolContext): Promise<string>;
    };
};

import type { OpencodeClient } from '@opencode-ai/sdk/client';
import { SwarmStateDB } from './state.js';
import type { Agent, Task, SpawnOptions, ProgressReport, HandoffData, SwarmState } from '../types.js';
export declare class CoordinatorManager {
    private basePath;
    private client;
    private swarms;
    private activeSwarmId;
    private globalTaskQueue;
    private orchestrator;
    setOrchestrator(orch: any): void;
    startOrchestrator(): void;
    stopOrchestrator(): void;
    submitGlobalTask(description: string, priority?: number, dependencies?: string[], rootSessionId?: string): any;
    private config;
    setConfig(cfg: Partial<typeof this.config>): void;
    getConfig(): typeof this.config;
    getResourceStatus(): Promise<{
        memory: {
            rssBytes: number;
            rssMB: number;
            heapTotalMB: number;
            heapUsedMB: number;
            externalMB: number;
            systemTotalMB: number;
            systemFreeMB: number;
            systemUsagePercent: number;
        };
        loadAvg: {
            '1min': number;
            '5min': number;
            '15min': number;
        };
        cpuCount: number;
        concurrentAgents: number;
        maxConcurrentAgents: number;
        canSpawn: boolean;
        cannotSpawnReason?: string;
    }>;
    setBasePath(basePath: string): void;
    setClient(client: OpencodeClient): void;
    getActiveSwarmId(): string | null;
    getCoordinator(swarmId?: string): Coordinator | null;
    createSwarm(rootSessionId: string): Promise<string>;
    initSwarmForTask(taskDescription: string, rootSessionId: string): Promise<{
        swarmId: string;
        plannerAgentId: string;
    }>;
    spawnWorkerAgent(options: SpawnOptions): Promise<Agent>;
    reportProgress(report: ProgressReport): Promise<void>;
    completeCurrentAgent(agentId: string, result: string): Promise<void>;
    failAgent(agentId: string, error: string): Promise<void>;
    handleHandoff(handoff: HandoffData): Promise<void>;
    broadcast(message: string, fromAgentId?: string): Promise<void>;
    abortSwarm(): Promise<void>;
    getSwarmStatus(swarmId?: string): {
        swarm: SwarmState | null;
        agents: Agent[];
        tasks: Task[];
    } | null;
    setActiveSwarm(swarmId: string): void;
    isSwarmComplete(): boolean;
    hasFailedTasks(): boolean;
}
export declare class Coordinator {
    private db;
    private basePath;
    private client;
    private spawnedAgents;
    private swarmId;
    private managerRef;
    private failureMap;
    constructor(swarmId: string, basePath: string, client: OpencodeClient | null, managerRef?: CoordinatorManager);
    initSwarm(rootSessionId: string): Promise<string>;
    setPlannerSession(plannerSessionId: string): Promise<void>;
    createTask(description: string, dependencies?: string[]): Promise<Task>;
    spawnAgent(options: SpawnOptions): Promise<Agent>;
    reportProgress(report: ProgressReport): Promise<void>;
    completeAgent(agentId: string, result: string): Promise<void>;
    failAgent(agentId: string, error: string): Promise<void>;
    handleHandoff(handoff: HandoffData): Promise<void>;
    abortSwarm(): Promise<void>;
    getSwarmStatus(): {
        swarm: SwarmState | null;
        agents: Agent[];
        tasks: Task[];
    };
    getAgents(): Agent[];
    getAgentSessionId(agentId: string): string | undefined;
    getDb(): SwarmStateDB;
    isSwarmComplete(): boolean;
    hasFailedTasks(): boolean;
    logEvent(agentId: string, type: 'progress' | 'complete' | 'fail' | 'handoff', data: Record<string, unknown>): void;
    private createChildSession;
    private abortSession;
    private readFile;
    private writeFile;
    private sanitizeText;
    close(): void;
}
export declare const coordinatorManager: CoordinatorManager;

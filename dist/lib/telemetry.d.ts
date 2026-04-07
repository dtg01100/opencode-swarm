export interface AgentMetrics {
    agentId: string;
    role: string;
    spawnedAt: number;
    completedAt?: number;
    durationMs?: number;
    status: 'completed' | 'failed' | 'running';
    retries: number;
}
export interface TaskMetrics {
    taskId: string;
    description: string;
    createdAt: number;
    completedAt?: number;
    durationMs?: number;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    agentId?: string;
}
export interface SwarmMetrics {
    swarmId: string;
    startedAt: number;
    endedAt?: number;
    totalDurationMs?: number;
    agentsSpawned: number;
    agentsCompleted: number;
    agentsFailed: number;
    tasksCreated: number;
    tasksCompleted: number;
    tasksFailed: number;
}
export declare class SwarmTelemetry {
    private agentMetrics;
    private taskMetrics;
    private swarmMetrics;
    private currentSwarmId;
    setCurrentSwarm(swarmId: string): void;
    trackAgentSpawn(agentId: string, role: string): void;
    trackAgentRetry(agentId: string): void;
    trackAgentComplete(agentId: string, status: 'completed' | 'failed'): void;
    trackTaskCreate(taskId: string, description: string): void;
    trackTaskStart(taskId: string, agentId: string): void;
    trackTaskComplete(taskId: string, status: 'completed' | 'failed'): void;
    endSwarm(swarmId: string): void;
    getSwarmMetrics(swarmId: string): SwarmMetrics | undefined;
    getAgentMetrics(agentId: string): AgentMetrics | undefined;
    getTaskMetrics(taskId: string): TaskMetrics | undefined;
    getSwarmSummary(swarmId: string): {
        swarmMetrics: SwarmMetrics | undefined;
        avgAgentDurationMs: number;
        avgTaskDurationMs: number;
        successRate: number;
    };
    clear(): void;
}
export declare const swarmTelemetry: SwarmTelemetry;

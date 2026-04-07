import type { Agent, Task, SwarmEvent, SwarmState, AgentStatus, TaskStatus, EventType } from '../types.js';
export declare class SwarmStateDB {
    private filePath;
    private swarmId;
    private state;
    constructor(swarmId: string, dbPath: string);
    private pendingWrites;
    private flushTimer;
    private readonly flushInterval;
    private readonly maxPendingWrites;
    /**
     * Schedule a write to disk, with debouncing to prevent excessive I/O
     */
    private schedulePersist;
    /**
     * Force write the current state to disk
     */
    private flush;
    createSwarm(state: SwarmState): void;
    getSwarm(): SwarmState | undefined;
    updateSwarmStatus(status: SwarmState['status']): void;
    updatePlannerSession(sessionId: string): void;
    createAgent(agent: Agent): void;
    getAgent(id: string): Agent | undefined;
    getAgents(): Agent[];
    updateAgentStatus(id: string, status: AgentStatus, progress?: number, result?: string, error?: string): void;
    createTask(task: Task): void;
    getTask(id: string): Task | undefined;
    getTasks(): Task[];
    getTasksByAgent(agentId: string): Task[];
    updateTaskStatus(id: string, status: TaskStatus, completedAt?: number): void;
    assignTaskToAgent(taskId: string, agentId: string): void;
    logEvent(agentId: string, type: EventType, data: Record<string, unknown>): void;
    getEvents(agentId?: string): SwarmEvent[];
    close(): void;
}
export declare function createSwarmStateDB(swarmId: string, basePath: string): SwarmStateDB;

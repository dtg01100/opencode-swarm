import type { CoordinatorManager } from './coordinator-manager.js';
export declare class Orchestrator {
    private manager;
    private basePath;
    private queue;
    private running;
    private intervalMs;
    private timer;
    private queueFile;
    constructor(manager?: CoordinatorManager, basePath?: string);
    submitGlobalTask(description: string, priority?: number, dependencies?: string[], rootSessionId?: string): string;
    start(): void;
    stop(): void;
    private scheduleOnce;
    private checkDependencies;
}
export default Orchestrator;

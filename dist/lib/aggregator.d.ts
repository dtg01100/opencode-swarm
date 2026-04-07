import { SwarmStateDB } from './state.js';
import type { AggregatedResult } from '../types.js';
export declare class Aggregator {
    private db;
    constructor(db: SwarmStateDB);
    aggregateResults(): AggregatedResult;
    private formatTaskOutput;
    private generateSummary;
    getFailedTasks(): ReturnType<typeof this.db.getTasks>;
    getCompletedTasks(): ReturnType<typeof this.db.getTasks>;
    getPendingTasks(): ReturnType<typeof this.db.getTasks>;
    getInProgressTasks(): ReturnType<typeof this.db.getTasks>;
}
export declare function createAggregator(db: SwarmStateDB): Aggregator;

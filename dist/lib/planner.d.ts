import type { Task } from '../types.js';
export interface ExecutionStrategy {
    type: 'parallel' | 'sequential' | 'hybrid';
    maxParallel: number;
    taskOrder: string[];
}
export interface TaskDependency {
    taskId: string;
    dependsOn: string[];
}
export interface PlannerDecision {
    tasks: Task[];
    strategy: ExecutionStrategy;
    reasoning: string;
}
export declare function analyzeTaskDependencies(tasks: Task[]): TaskDependency[];
export declare function canRunParallel(task: Task, completedTasks: Set<string>, allTasks: Task[]): boolean;
export declare function determineExecutionStrategy(tasks: Task[]): ExecutionStrategy;
export declare function topologicalSort(tasks: Task[]): string[];
export declare function getNextExecutableTasks(tasks: Task[], completedTasks: Set<string>, maxParallel: number): Task[];
export declare function sortTasksByPriority(tasks: Task[]): Task[];
export declare function createPlannerPrompt(taskDescription: string, existingContext: string): string;

import { describe, it, expect } from 'vitest';
import {
  analyzeTaskDependencies,
  canRunParallel,
  determineExecutionStrategy,
  topologicalSort,
  getNextExecutableTasks,
  createPlannerPrompt,
} from './planner.js';
import type { Task } from '../types.js';

const createMockTask = (id: string, dependencies: string[] = [], status: Task['status'] = 'pending'): Task => ({
  id,
  description: `Task ${id}`,
  dependencies,
  status,
  createdAt: Date.now(),
});

describe('planner', () => {
  describe('analyzeTaskDependencies', () => {
    it('should return empty array for empty task list', () => {
      const result = analyzeTaskDependencies([]);
      expect(result).toEqual([]);
    });

    it('should extract dependencies for each task', () => {
      const tasks = [
        createMockTask('task1', []),
        createMockTask('task2', ['task1']),
        createMockTask('task3', ['task1', 'task2']),
      ];

      const result = analyzeTaskDependencies(tasks);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ taskId: 'task1', dependsOn: [] });
      expect(result[1]).toEqual({ taskId: 'task2', dependsOn: ['task1'] });
      expect(result[2]).toEqual({ taskId: 'task3', dependsOn: ['task1', 'task2'] });
    });
  });

  describe('canRunParallel', () => {
    it('should return true for task with no dependencies', () => {
      const task = createMockTask('task1', []);
      const completedTasks = new Set<string>();
      const allTasks = [task];

      expect(canRunParallel(task, completedTasks, allTasks)).toBe(true);
    });

    it('should return true when all dependencies are completed', () => {
      const task = createMockTask('task2', ['task1']);
      const completedTasks = new Set(['task1']);
      const allTasks = [
        createMockTask('task1', []),
        task,
      ];

      expect(canRunParallel(task, completedTasks, allTasks)).toBe(true);
    });

    it('should return false when dependencies are not completed', () => {
      const task = createMockTask('task2', ['task1']);
      const completedTasks = new Set<string>();
      const allTasks = [
        createMockTask('task1', []),
        task,
      ];

      expect(canRunParallel(task, completedTasks, allTasks)).toBe(false);
    });

    it('should return false when some dependencies are not completed', () => {
      const task = createMockTask('task3', ['task1', 'task2']);
      const completedTasks = new Set(['task1']);
      const allTasks = [
        createMockTask('task1', []),
        createMockTask('task2', []),
        task,
      ];

      expect(canRunParallel(task, completedTasks, allTasks)).toBe(false);
    });

    it('should handle circular dependency references gracefully', () => {
      const task = createMockTask('task1', ['task2']);
      const allTasks = [task];

      expect(() => canRunParallel(task, new Set(), allTasks)).not.toThrow();
    });
  });

  describe('determineExecutionStrategy', () => {
    it('should return sequential with empty task list', () => {
      const result = determineExecutionStrategy([]);

      expect(result.type).toBe('sequential');
      expect(result.maxParallel).toBe(1);
      expect(result.taskOrder).toEqual([]);
    });

    it('should return parallel strategy for independent tasks', () => {
      const tasks = [
        createMockTask('task1', []),
        createMockTask('task2', []),
        createMockTask('task3', []),
      ];

      const result = determineExecutionStrategy(tasks);

      expect(result.type).toBe('parallel');
      expect(result.maxParallel).toBe(3);
    });

    it('should return sequential strategy for heavily dependent tasks', () => {
      const tasks = [
        createMockTask('task1', []),
        createMockTask('task2', ['task1']),
        createMockTask('task3', ['task2']),
        createMockTask('task4', ['task3']),
      ];

      const result = determineExecutionStrategy(tasks);

      expect(result.type).toBe('sequential');
      expect(result.maxParallel).toBe(1);
    });

    it('should return hybrid strategy for moderate dependencies', () => {
      const tasks = [
        createMockTask('task1', []),
        createMockTask('task2', []),
        createMockTask('task3', ['task1']),
        createMockTask('task4', ['task2']),
      ];

      const result = determineExecutionStrategy(tasks);

      expect(result.type).toBe('hybrid');
      expect(result.maxParallel).toBeGreaterThan(1);
    });

    it('should cap parallel tasks at 4', () => {
      const tasks = [
        createMockTask('task1', []),
        createMockTask('task2', []),
        createMockTask('task3', []),
        createMockTask('task4', []),
        createMockTask('task5', []),
        createMockTask('task6', []),
      ];

      const result = determineExecutionStrategy(tasks);

      expect(result.maxParallel).toBe(4);
    });
  });

  describe('topologicalSort', () => {
    it('should return empty array for empty task list', () => {
      const result = topologicalSort([]);
      expect(result).toEqual([]);
    });

    it('should return single task in order', () => {
      const tasks = [createMockTask('task1', [])];
      const result = topologicalSort(tasks);
      expect(result).toEqual(['task1']);
    });

    it('should order tasks by dependencies', () => {
      const tasks = [
        createMockTask('task3', ['task1', 'task2']),
        createMockTask('task1', []),
        createMockTask('task2', []),
      ];

      const result = topologicalSort(tasks);

      expect(result.indexOf('task1')).toBeLessThan(result.indexOf('task3'));
      expect(result.indexOf('task2')).toBeLessThan(result.indexOf('task3'));
    });

    it('should handle linear dependency chain', () => {
      const tasks = [
        createMockTask('task4', ['task3']),
        createMockTask('task2', ['task1']),
        createMockTask('task3', ['task2']),
        createMockTask('task1', []),
      ];

      const result = topologicalSort(tasks);

      expect(result).toEqual(['task1', 'task2', 'task3', 'task4']);
    });

    it('should throw error for circular dependencies', () => {
      const tasks = [
        createMockTask('task1', ['task2']),
        createMockTask('task2', ['task1']),
      ];

      expect(() => topologicalSort(tasks)).toThrow('Circular dependency detected');
    });

    it('should preserve order for independent tasks', () => {
      const tasks = [
        createMockTask('task1', []),
        createMockTask('task2', []),
        createMockTask('task3', []),
      ];

      const result = topologicalSort(tasks);

      expect(result).toContain('task1');
      expect(result).toContain('task2');
      expect(result).toContain('task3');
      expect(result).toHaveLength(3);
    });
  });

  describe('getNextExecutableTasks', () => {
    it('should return empty array for empty task list', () => {
      const result = getNextExecutableTasks([], new Set(), 4);
      expect(result).toEqual([]);
    });

    it('should return all pending tasks with no dependencies', () => {
      const tasks = [
        createMockTask('task1', []),
        createMockTask('task2', []),
        createMockTask('task3', []),
      ];

      const result = getNextExecutableTasks(tasks, new Set(), 4);

      expect(result).toHaveLength(3);
    });

    it('should respect maxParallel limit', () => {
      const tasks = [
        createMockTask('task1', []),
        createMockTask('task2', []),
        createMockTask('task3', []),
        createMockTask('task4', []),
        createMockTask('task5', []),
      ];

      const result = getNextExecutableTasks(tasks, new Set(), 2);

      expect(result).toHaveLength(2);
    });

    it('should only return tasks with completed dependencies', () => {
      const tasks = [
        createMockTask('task1', []),
        createMockTask('task2', ['task1']),
        createMockTask('task3', ['task1']),
        createMockTask('task4', ['task2', 'task3']),
      ];

      const completedTasks = new Set(['task1']);
      const result = getNextExecutableTasks(tasks, completedTasks, 4);

      expect(result.map(t => t.id)).toContain('task2');
      expect(result.map(t => t.id)).toContain('task3');
      expect(result.map(t => t.id)).not.toContain('task4');
    });

    it('should not return already completed tasks', () => {
      const tasks = [
        createMockTask('task1', [], 'completed'),
        createMockTask('task2', []),
      ];

      const result = getNextExecutableTasks(tasks, new Set(), 4);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('task2');
    });

    it('should return pending tasks after completed ones', () => {
      const tasks = [
        createMockTask('task1', [], 'completed'),
        createMockTask('task2', ['task1']),
      ];

      const completedTasks = new Set(['task1']);
      const result = getNextExecutableTasks(tasks, completedTasks, 4);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('task2');
    });
  });

  describe('createPlannerPrompt', () => {
    it('should include task description in prompt', () => {
      const result = createPlannerPrompt('Implement user auth', '');

      expect(result).toContain('Implement user auth');
    });

    it('should include existing context when provided', () => {
      const context = 'Previous work: Set up database schema';
      const result = createPlannerPrompt('Add login feature', context);

      expect(result).toContain('Previous work: Set up database schema');
    });

    it('should indicate no context when empty', () => {
      const result = createPlannerPrompt('Add login feature', '');

      expect(result).toContain('(none)');
    });

    it('should contain instructions for decomposition', () => {
      const result = createPlannerPrompt('Build API', '');

      expect(result).toContain('Break down');
      expect(result).toContain('subtasks');
      expect(result).toContain('dependencies');
    });

    it('should mention agent roles', () => {
      const result = createPlannerPrompt('Build API', '');

      expect(result).toContain('coder');
      expect(result).toContain('reviewer');
      expect(result).toContain('tester');
    });
  });
});
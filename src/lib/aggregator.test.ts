import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Aggregator, createAggregator } from './aggregator.js';
import { SwarmStateDB } from './state.js';
import type { Agent, Task, SwarmState } from '../types.js';

vi.mock('./state.js');

describe('Aggregator', () => {
  let aggregator: Aggregator;
  let mockDb: SwarmStateDB;

  beforeEach(() => {
    mockDb = {
      getSwarm: vi.fn(),
      getAgents: vi.fn(),
      getTasks: vi.fn(),
      getTask: vi.fn(),
      getAgent: vi.fn(),
    } as unknown as SwarmStateDB;
    aggregator = new Aggregator(mockDb);
  });

  describe('aggregateResults', () => {
    it('should throw error when swarm not found', () => {
      vi.mocked(mockDb.getSwarm).mockReturnValue(undefined);

      expect(() => aggregator.aggregateResults()).toThrow('Swarm not found');
    });

    it('should aggregate results with all tasks and agents', () => {
      const swarm: SwarmState = {
        id: 'swarm-1',
        rootSessionId: 'session-1',
        status: 'completed',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const agents: Agent[] = [
        {
          id: 'agent-1',
          role: 'coder',
          status: 'completed',
          progress: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'agent-2',
          role: 'reviewer',
          status: 'completed',
          progress: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const tasks: Task[] = [
        {
          id: 'task-1',
          description: 'Implement login',
          status: 'completed',
          dependencies: [],
          agentId: 'agent-1',
          createdAt: Date.now(),
        },
        {
          id: 'task-2',
          description: 'Review code',
          status: 'completed',
          dependencies: ['task-1'],
          agentId: 'agent-2',
          createdAt: Date.now(),
        },
      ];

      vi.mocked(mockDb.getSwarm).mockReturnValue(swarm);
      vi.mocked(mockDb.getAgents).mockReturnValue(agents);
      vi.mocked(mockDb.getTasks).mockReturnValue(tasks);

      const result = aggregator.aggregateResults();

      expect(result.swarmId).toBe('swarm-1');
      expect(result.totalTasks).toBe(2);
      expect(result.completedTasks).toBe(2);
      expect(result.failedTasks).toBe(0);
      expect(result.results).toHaveLength(2);
    });

    it('should count failed tasks correctly', () => {
      const swarm: SwarmState = {
        id: 'swarm-1',
        rootSessionId: 'session-1',
        status: 'completed',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const tasks: Task[] = [
        { id: 'task-1', description: 'Task 1', status: 'completed', dependencies: [], createdAt: Date.now() },
        { id: 'task-2', description: 'Task 2', status: 'failed', dependencies: [], createdAt: Date.now() },
        { id: 'task-3', description: 'Task 3', status: 'completed', dependencies: [], createdAt: Date.now() },
      ];

      vi.mocked(mockDb.getSwarm).mockReturnValue(swarm);
      vi.mocked(mockDb.getAgents).mockReturnValue([]);
      vi.mocked(mockDb.getTasks).mockReturnValue(tasks);

      const result = aggregator.aggregateResults();

      expect(result.totalTasks).toBe(3);
      expect(result.completedTasks).toBe(2);
      expect(result.failedTasks).toBe(1);
    });

    it('should include agent info in task output', () => {
      const swarm: SwarmState = {
        id: 'swarm-1',
        rootSessionId: 'session-1',
        status: 'completed',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const agent: Agent = {
        id: 'agent-1',
        role: 'coder',
        status: 'completed',
        progress: 1,
        result: 'Done!',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const task: Task = {
        id: 'task-1',
        description: 'Implement login',
        status: 'completed',
        dependencies: [],
        agentId: 'agent-1',
        createdAt: Date.now(),
      };

      vi.mocked(mockDb.getSwarm).mockReturnValue(swarm);
      vi.mocked(mockDb.getAgents).mockReturnValue([agent]);
      vi.mocked(mockDb.getTasks).mockReturnValue([task]);
      vi.mocked(mockDb.getAgent).mockReturnValue(agent);

      const result = aggregator.aggregateResults();

      expect(result.results[0].agentId).toBe('agent-1');
      expect(result.results[0].status).toBe('completed');
    });
  });

  describe('getFailedTasks', () => {
    it('should return only failed tasks', () => {
      const tasks: Task[] = [
        { id: 'task-1', description: 'Task 1', status: 'completed', dependencies: [], createdAt: Date.now() },
        { id: 'task-2', description: 'Task 2', status: 'failed', dependencies: [], createdAt: Date.now() },
        { id: 'task-3', description: 'Task 3', status: 'pending', dependencies: [], createdAt: Date.now() },
      ];

      vi.mocked(mockDb.getTasks).mockReturnValue(tasks);

      const result = aggregator.getFailedTasks();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('task-2');
    });

    it('should return empty array when no failed tasks', () => {
      vi.mocked(mockDb.getTasks).mockReturnValue([
        { id: 'task-1', description: 'Task 1', status: 'completed', dependencies: [], createdAt: Date.now() },
      ]);

      const result = aggregator.getFailedTasks();

      expect(result).toEqual([]);
    });
  });

  describe('getCompletedTasks', () => {
    it('should return only completed tasks', () => {
      const tasks: Task[] = [
        { id: 'task-1', description: 'Task 1', status: 'completed', dependencies: [], createdAt: Date.now() },
        { id: 'task-2', description: 'Task 2', status: 'failed', dependencies: [], createdAt: Date.now() },
        { id: 'task-3', description: 'Task 3', status: 'completed', dependencies: [], createdAt: Date.now() },
      ];

      vi.mocked(mockDb.getTasks).mockReturnValue(tasks);

      const result = aggregator.getCompletedTasks();

      expect(result).toHaveLength(2);
      expect(result.map(t => t.id)).toContain('task-1');
      expect(result.map(t => t.id)).toContain('task-3');
    });
  });

  describe('getPendingTasks', () => {
    it('should return only pending tasks', () => {
      const tasks: Task[] = [
        { id: 'task-1', description: 'Task 1', status: 'completed', dependencies: [], createdAt: Date.now() },
        { id: 'task-2', description: 'Task 2', status: 'pending', dependencies: [], createdAt: Date.now() },
        { id: 'task-3', description: 'Task 3', status: 'in_progress', dependencies: [], createdAt: Date.now() },
      ];

      vi.mocked(mockDb.getTasks).mockReturnValue(tasks);

      const result = aggregator.getPendingTasks();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('task-2');
    });
  });

  describe('getInProgressTasks', () => {
    it('should return only in_progress tasks', () => {
      const tasks: Task[] = [
        { id: 'task-1', description: 'Task 1', status: 'completed', dependencies: [], createdAt: Date.now() },
        { id: 'task-2', description: 'Task 2', status: 'in_progress', dependencies: [], createdAt: Date.now() },
        { id: 'task-3', description: 'Task 3', status: 'in_progress', dependencies: [], createdAt: Date.now() },
      ];

      vi.mocked(mockDb.getTasks).mockReturnValue(tasks);

      const result = aggregator.getInProgressTasks();

      expect(result).toHaveLength(2);
    });
  });

  describe('createAggregator', () => {
    it('should create aggregator with db', () => {
      const db = {} as SwarmStateDB;
      const result = createAggregator(db);
      expect(result).toBeInstanceOf(Aggregator);
    });
  });
});
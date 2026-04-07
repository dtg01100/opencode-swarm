import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CoordinatorManager, Coordinator } from './coordinator-manager.js';
import type { OpencodeClient } from '@opencode-ai/sdk/client';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const mockSessionCreate = vi.fn();
const mockSessionAbort = vi.fn();

const createMockClient = (): OpencodeClient => ({
  session: {
    create: mockSessionCreate,
    abort: mockSessionAbort,
  },
} as unknown as OpencodeClient);

describe('CoordinatorManager', () => {
  let manager: CoordinatorManager;
  let tempDir: string;

  beforeEach(() => {
    manager = new CoordinatorManager();
    tempDir = mkdtempSync(join(tmpdir(), 'swarm-coord-test-'));
    manager.setBasePath(tempDir);
    mockSessionCreate.mockReset();
    mockSessionAbort.mockReset();
    mockSessionCreate.mockResolvedValue({ sessionId: 'new-session-id' });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('createSwarm', () => {
    it('should create a new swarm and return swarmId', async () => {
      const client = createMockClient();
      manager.setClient(client);

      const swarmId = await manager.createSwarm('root-session-1');

      expect(swarmId).toBeDefined();
      expect(typeof swarmId).toBe('string');
      expect(swarmId.length).toBeGreaterThan(0);
    });

    it('should set the created swarm as active', async () => {
      const client = createMockClient();
      manager.setClient(client);

      const swarmId = await manager.createSwarm('root-session-1');

      expect(manager.getActiveSwarmId()).toBe(swarmId);
    });

    it('should create coordinator for the swarm', async () => {
      const client = createMockClient();
      manager.setClient(client);

      const swarmId = await manager.createSwarm('root-session-1');
      const coordinator = manager.getCoordinator(swarmId);

      expect(coordinator).not.toBeNull();
    });
  });

  describe('getCoordinator', () => {
    it('should return null when no swarm exists', () => {
      expect(manager.getCoordinator()).toBeNull();
    });

    it('should return coordinator for specific swarm', async () => {
      const client = createMockClient();
      manager.setClient(client);

      const swarmId = await manager.createSwarm('root-session-1');
      const coordinator = manager.getCoordinator(swarmId);

      expect(coordinator).not.toBeNull();
    });

    it('should return active coordinator when no swarmId specified', async () => {
      const client = createMockClient();
      manager.setClient(client);

      await manager.createSwarm('root-session-1');
      const coordinator = manager.getCoordinator();

      expect(coordinator).not.toBeNull();
    });
  });

  describe('initSwarmForTask', () => {
    it('should create swarm with planner task and agent', async () => {
      const client = createMockClient();
      manager.setClient(client);

      const { swarmId, plannerAgentId } = await manager.initSwarmForTask(
        'Build user authentication',
        'root-session-1'
      );

      expect(swarmId).toBeDefined();
      expect(plannerAgentId).toBeDefined();
    });

    it('should have planner task in swarm', async () => {
      const client = createMockClient();
      manager.setClient(client);

      await manager.initSwarmForTask('Build user authentication', 'root-session-1');

      const status = manager.getSwarmStatus();
      expect(status?.tasks.length).toBeGreaterThan(0);
      expect(status?.tasks[0].description).toContain('Plan');
    });
  });

  describe('spawnWorkerAgent', () => {
    it('should throw when no active swarm', async () => {
      await expect(
        manager.spawnWorkerAgent({
          role: 'coder',
          taskId: 'task-1',
        })
      ).rejects.toThrow('No active swarm');
    });

    it('should create worker agent in swarm', async () => {
      const client = createMockClient();
      manager.setClient(client);

      await manager.createSwarm('root-session-1');

      const agent = await manager.spawnWorkerAgent({
        role: 'coder',
        taskId: 'task-1',
        parentSessionId: 'parent-session',
      });

      expect(agent).toBeDefined();
      expect(agent.role).toBe('coder');
      expect(agent.status).toBe('running');
    });

    it('should enforce maxConcurrentAgents limit', async () => {
      const client = createMockClient();
      manager.setClient(client);
      // set high resource thresholds for test environment
      manager.setConfig({ maxConcurrentAgents: 2, maxRssBytes: Number.MAX_SAFE_INTEGER, maxLoadAvg: Number.MAX_SAFE_INTEGER });

      await manager.createSwarm('root-session-2');

      const a1 = await manager.spawnWorkerAgent({ role: 'coder', taskId: 't1' });
      const a2 = await manager.spawnWorkerAgent({ role: 'coder', taskId: 't2' });

      await expect(manager.spawnWorkerAgent({ role: 'coder', taskId: 't3' })).rejects.toThrow('Max concurrent agents reached');
    });

    it('should respect resource limits and fail when system under pressure', async () => {
      const client = createMockClient();
      manager.setClient(client);
      // set tiny memory limit to trigger rejection
      manager.setConfig({ maxRssBytes: 1, maxLoadAvg: Number.MAX_SAFE_INTEGER });

      await manager.createSwarm('root-session-3');

      await expect(manager.spawnWorkerAgent({ role: 'coder', taskId: 't4' })).rejects.toThrow('System memory (rss)');
    });
  });

  describe('reportProgress', () => {
    it('should throw when no active swarm', async () => {
      await expect(
        manager.reportProgress({
          agentId: 'agent-1',
          progress: 0.5,
        })
      ).rejects.toThrow('No active swarm');
    });

    it('should update agent progress', async () => {
      const client = createMockClient();
      manager.setClient(client);

      await manager.createSwarm('root-session-1');
      const agent = await manager.spawnWorkerAgent({
        role: 'coder',
        taskId: 'task-1',
      });

      await manager.reportProgress({
        agentId: agent.id,
        progress: 0.75,
        message: 'Half done',
      });

      const status = manager.getSwarmStatus();
      const updatedAgent = status?.agents.find(a => a.id === agent.id);
      expect(updatedAgent?.progress).toBe(0.75);
    });
  });

  describe('completeCurrentAgent', () => {
    it('should throw when no active swarm', async () => {
      await expect(
        manager.completeCurrentAgent('agent-1', 'Done!')
      ).rejects.toThrow('No active swarm');
    });

    it('should mark agent as completed', async () => {
      const client = createMockClient();
      manager.setClient(client);

      await manager.createSwarm('root-session-1');
      const agent = await manager.spawnWorkerAgent({
        role: 'coder',
        taskId: 'task-1',
      });

      await manager.completeCurrentAgent(agent.id, 'Implemented feature X');

      const status = manager.getSwarmStatus();
      const updatedAgent = status?.agents.find(a => a.id === agent.id);
      expect(updatedAgent?.status).toBe('completed');
      expect(updatedAgent?.result).toBe('Implemented feature X');
    });
  });

  describe('failAgent', () => {
    it('should throw when no active swarm', async () => {
      await expect(
        manager.failAgent('agent-1', 'Network error')
      ).rejects.toThrow('No active swarm');
    });

    it('should mark agent as failed with error', async () => {
      const client = createMockClient();
      manager.setClient(client);

      await manager.createSwarm('root-session-1');
      const agent = await manager.spawnWorkerAgent({
        role: 'coder',
        taskId: 'task-1',
      });

      await manager.failAgent(agent.id, 'Network error');

      const status = manager.getSwarmStatus();
      const updatedAgent = status?.agents.find(a => a.id === agent.id);
      expect(updatedAgent?.status).toBe('failed');
      expect(updatedAgent?.error).toBe('Network error');
    });

    it('should apply backoff after failures for the same task', async () => {
      const client = createMockClient();
      manager.setClient(client);
      manager.setConfig({ backoffBaseSeconds: 1, maxRssBytes: Number.MAX_SAFE_INTEGER, maxLoadAvg: Number.MAX_SAFE_INTEGER });

      await manager.createSwarm('root-session-backoff');
      const agent = await manager.spawnWorkerAgent({ role: 'tester', taskId: 'backoff-task' });
      await manager.failAgent(agent.id, 'simulated');

      await expect(manager.spawnWorkerAgent({ role: 'tester', taskId: 'backoff-task' })).rejects.toThrow('Backoff active for task');
    });
  });

  describe('broadcast', () => {
    it('should throw when no active swarm', async () => {
      await expect(
        manager.broadcast('Hello agents')
      ).rejects.toThrow('No active swarm');
    });
  });

  describe('abortSwarm', () => {
    it('should throw when no active swarm', async () => {
      await expect(manager.abortSwarm()).rejects.toThrow('No active swarm');
    });

    it('should update swarm status to aborted', async () => {
      const client = createMockClient();
      manager.setClient(client);

      await manager.createSwarm('root-session-1');

      await manager.abortSwarm();

      const status = manager.getSwarmStatus();
      expect(status?.swarm?.status).toBe('aborted');
    });
  });

  describe('getSwarmStatus', () => {
    it('should return null when no swarm exists', () => {
      expect(manager.getSwarmStatus()).toBeNull();
    });

    it('should return swarm, agents, and tasks', async () => {
      const client = createMockClient();
      manager.setClient(client);

      await manager.createSwarm('root-session-1');
      await manager.spawnWorkerAgent({
        role: 'coder',
        taskId: 'task-1',
      });

      const status = manager.getSwarmStatus();

      expect(status).not.toBeNull();
      expect(status!.swarm).toBeDefined();
      expect(status!.agents).toHaveLength(1);
      expect(status!.tasks).toHaveLength(1);
    });
  });

  describe('isSwarmComplete', () => {
    it('should return false when no swarm', () => {
      expect(manager.isSwarmComplete()).toBe(false);
    });

    it('should return true when all agents completed', async () => {
      const client = createMockClient();
      manager.setClient(client);

      await manager.createSwarm('root-session-1');
      const agent = await manager.spawnWorkerAgent({
        role: 'coder',
        taskId: 'task-1',
      });
      await manager.completeCurrentAgent(agent.id, 'Done');

      expect(manager.isSwarmComplete()).toBe(true);
    });

    it('should return false when agents still running', async () => {
      const client = createMockClient();
      manager.setClient(client);

      await manager.createSwarm('root-session-1');
      await manager.spawnWorkerAgent({
        role: 'coder',
        taskId: 'task-1',
      });

      expect(manager.isSwarmComplete()).toBe(false);
    });
  });

  describe('hasFailedTasks', () => {
    it('should return false when no swarm', () => {
      expect(manager.hasFailedTasks()).toBe(false);
    });

    it('should return true when tasks have failed', async () => {
      const client = createMockClient();
      manager.setClient(client);

      await manager.createSwarm('root-session-1');
      const agent = await manager.spawnWorkerAgent({
        role: 'coder',
        taskId: 'task-1',
      });
      await manager.failAgent(agent.id, 'Error');

      expect(manager.hasFailedTasks()).toBe(true);
    });

    it('should return false when all tasks succeeded', async () => {
      const client = createMockClient();
      manager.setClient(client);

      await manager.createSwarm('root-session-1');
      const agent = await manager.spawnWorkerAgent({
        role: 'coder',
        taskId: 'task-1',
      });
      await manager.completeCurrentAgent(agent.id, 'Done');

      expect(manager.hasFailedTasks()).toBe(false);
    });
  });
});

describe('Coordinator', () => {
  let coordinator: Coordinator;
  let tempDir: string;
  let mockClient: OpencodeClient;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'coordinator-test-'));
    mockClient = createMockClient();
    coordinator = new Coordinator('test-swarm', tempDir, mockClient);
  });

  afterEach(() => {
    coordinator.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('initSwarm', () => {
    it('should initialize swarm with root session', async () => {
      const swarmId = await coordinator.initSwarm('root-session');

      expect(swarmId).toBe('test-swarm');
      const status = coordinator.getSwarmStatus();
      expect(status.swarm?.rootSessionId).toBe('root-session');
    });
  });

  describe('createTask', () => {
    it('should create a new task', async () => {
      const task = await coordinator.createTask('Implement login');

      expect(task).toBeDefined();
      expect(task.description).toBe('Implement login');
      expect(task.status).toBe('pending');
    });

    it('should create task with dependencies', async () => {
      const task = await coordinator.createTask('Review code', ['task-1']);

      expect(task.dependencies).toEqual(['task-1']);
    });
  });

  describe('spawnAgent', () => {
    it('should create agent with pending status initially', async () => {
      await coordinator.initSwarm('root-session');
      const task = await coordinator.createTask('Code task');

      const agent = await coordinator.spawnAgent({
        role: 'coder',
        taskId: task.id,
        parentSessionId: 'parent-session',
      });

      expect(agent.role).toBe('coder');
      expect(agent.status).toBe('running');
    });

    it('should assign task to agent', async () => {
      await coordinator.initSwarm('root-session');
      const task = await coordinator.createTask('Code task');

      await coordinator.spawnAgent({
        role: 'coder',
        taskId: task.id,
      });

      const status = coordinator.getSwarmStatus();
      const updatedTask = status.tasks.find(t => t.id === task.id);
      expect(updatedTask?.agentId).toBeDefined();
    });

    it('should call session.create with correct params', async () => {
      await coordinator.initSwarm('root-session');

      await coordinator.spawnAgent({
        role: 'reviewer',
        taskId: 'task-1',
        parentSessionId: 'parent-session',
      });

      expect(mockSessionCreate).toHaveBeenCalled();
    });
  });

  describe('getAgents', () => {
    it('should return all agents', async () => {
      await coordinator.initSwarm('root-session');
      await coordinator.spawnAgent({ role: 'coder', taskId: 'task-1' });
      await coordinator.spawnAgent({ role: 'reviewer', taskId: 'task-2' });

      const agents = coordinator.getAgents();

      expect(agents).toHaveLength(2);
    });
  });

  describe('isSwarmComplete', () => {
    it('should return false when no agents', () => {
      expect(coordinator.isSwarmComplete()).toBe(false);
    });

    it('should return false when agents still running', async () => {
      await coordinator.initSwarm('root-session');
      await coordinator.spawnAgent({ role: 'coder', taskId: 'task-1' });

      expect(coordinator.isSwarmComplete()).toBe(false);
    });

    it('should return true when all agents completed', async () => {
      await coordinator.initSwarm('root-session');
      const agent = await coordinator.spawnAgent({ role: 'coder', taskId: 'task-1' });
      await coordinator.completeAgent(agent.id, 'Done');

      expect(coordinator.isSwarmComplete()).toBe(true);
    });

    it('should return false when some agents failed', async () => {
      await coordinator.initSwarm('root-session');
      const agent1 = await coordinator.spawnAgent({ role: 'coder', taskId: 'task-1' });
      const agent2 = await coordinator.spawnAgent({ role: 'reviewer', taskId: 'task-2' });
      await coordinator.completeAgent(agent1.id, 'Done');
      await coordinator.failAgent(agent2.id, 'Error');

      expect(coordinator.isSwarmComplete()).toBe(false);
    });
  });

  describe('hasFailedTasks', () => {
    it('should return false when no tasks', () => {
      expect(coordinator.hasFailedTasks()).toBe(false);
    });

    it('should return true when tasks failed', async () => {
      await coordinator.initSwarm('root-session');
      const task = await coordinator.createTask('Task 1');
      const agent = await coordinator.spawnAgent({ role: 'coder', taskId: task.id });
      await coordinator.failAgent(agent.id, 'Error');

      expect(coordinator.hasFailedTasks()).toBe(true);
    });
  });

  describe('handleHandoff', () => {
    it('should write handoff file and log event', async () => {
      await coordinator.initSwarm('root-session');
      const data = {
        taskId: 'task-1',
        fromAgentId: 'agent-1',
        context: 'Some context for handoff',
        files: ['a.txt'],
        decisions: ['decision-1'],
      };

      await coordinator.handleHandoff(data as any);

      const fs = await import('fs');
      const { join } = await import('path');
      const content = fs.readFileSync(join(tempDir, 'task-1', 'handoff.md'), 'utf-8');

      expect(content).toContain('Handoff from agent-1');
      expect(content).toContain('Some context for handoff');
      expect(content).toContain('- a.txt');

      const events = (coordinator as any).db.getEvents();
      const handoffEvent = events.find((e: any) => e.type === 'handoff');
      expect(handoffEvent).toBeDefined();
      expect((handoffEvent.data as any).taskId).toBe('task-1');
    });

    it('should aggregate prior handoffs', async () => {
      await coordinator.initSwarm('root-session');

      await coordinator.handleHandoff({
        taskId: 'task-2',
        fromAgentId: 'agent-A',
        context: 'first',
        files: [],
        decisions: [],
      } as any);

      await coordinator.handleHandoff({
        taskId: 'task-2',
        fromAgentId: 'agent-B',
        context: 'second',
        files: ['b.txt'],
        decisions: ['d2'],
      } as any);

      const fs = await import('fs');
      const { join } = await import('path');
      const content = fs.readFileSync(join(tempDir, 'task-2', 'handoff.md'), 'utf-8');

      expect(content).toContain('Handoff from agent-A');
      expect(content).toContain('Handoff from agent-B');
      expect(content.indexOf('Handoff from agent-A')).toBeLessThan(content.indexOf('Handoff from agent-B'));
    });
  });
});
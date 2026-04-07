import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SwarmStateDB } from './state.js';
import type { Agent, Task, SwarmState, AgentStatus, TaskStatus } from '../types.js';

import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

describe('SwarmStateDB', () => {
  let db: SwarmStateDB;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'swarm-test-'));
    db = new SwarmStateDB('test-swarm-id', tempDir);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('createSwarm and getSwarm', () => {
    it('should create and retrieve swarm state', () => {
      const swarm: SwarmState = {
        id: 'swarm-1',
        rootSessionId: 'session-1',
        status: 'planning',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      db.createSwarm(swarm);
      const result = db.getSwarm();

      expect(result).toBeDefined();
      expect(result?.id).toBe('swarm-1');
      expect(result?.rootSessionId).toBe('session-1');
      expect(result?.status).toBe('planning');
    });

    it('should return undefined for non-existent swarm', () => {
      const result = db.getSwarm();
      expect(result).toBeUndefined();
    });

    it('should store planner session id', () => {
      const swarm: SwarmState = {
        id: 'swarm-1',
        rootSessionId: 'session-1',
        plannerSessionId: 'planner-session',
        status: 'planning',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      db.createSwarm(swarm);
      const result = db.getSwarm();

      expect(result?.plannerSessionId).toBe('planner-session');
    });
  });

  describe('updateSwarmStatus', () => {
    it('should update swarm status', () => {
      const swarm: SwarmState = {
        id: 'swarm-1',
        rootSessionId: 'session-1',
        status: 'planning',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      db.createSwarm(swarm);
      db.updateSwarmStatus('executing');

      const result = db.getSwarm();
      expect(result?.status).toBe('executing');
    });

    it('should update planner session id', () => {
      const swarm: SwarmState = {
        id: 'swarm-1',
        rootSessionId: 'session-1',
        status: 'planning',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      db.createSwarm(swarm);
      db.updatePlannerSession('new-planner-session');

      const result = db.getSwarm();
      expect(result?.plannerSessionId).toBe('new-planner-session');
    });
  });

  describe('createAgent and getAgent', () => {
    it('should create and retrieve agent', () => {
      const agent: Agent = {
        id: 'agent-1',
        role: 'coder',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      db.createAgent(agent);
      const result = db.getAgent('agent-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('agent-1');
      expect(result?.role).toBe('coder');
      expect(result?.status).toBe('pending');
      expect(result?.progress).toBe(0);
    });

    it('should return undefined for non-existent agent', () => {
      const result = db.getAgent('non-existent');
      expect(result).toBeUndefined();
    });

    it('should store agent with result and error', () => {
      const agent: Agent = {
        id: 'agent-1',
        role: 'coder',
        status: 'completed',
        progress: 1,
        result: 'Implemented feature X',
        error: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      db.createAgent(agent);
      const result = db.getAgent('agent-1');

      expect(result?.result).toBe('Implemented feature X');
    });
  });

  describe('getAgents', () => {
    it('should return all agents', () => {
      db.createAgent({
        id: 'agent-1',
        role: 'coder',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      db.createAgent({
        id: 'agent-2',
        role: 'reviewer',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = db.getAgents();

      expect(result).toHaveLength(2);
    });

    it('should return empty array when no agents', () => {
      const result = db.getAgents();
      expect(result).toEqual([]);
    });
  });

  describe('updateAgentStatus', () => {
    it('should update agent status', () => {
      db.createAgent({
        id: 'agent-1',
        role: 'coder',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      db.updateAgentStatus('agent-1', 'running', 0.5);

      const result = db.getAgent('agent-1');
      expect(result?.status).toBe('running');
      expect(result?.progress).toBe(0.5);
    });

    it('should update agent with result', () => {
      db.createAgent({
        id: 'agent-1',
        role: 'coder',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      db.updateAgentStatus('agent-1', 'completed', 1, 'Done!');

      const result = db.getAgent('agent-1');
      expect(result?.status).toBe('completed');
      expect(result?.result).toBe('Done!');
    });

    it('should update agent with error', () => {
      db.createAgent({
        id: 'agent-1',
        role: 'coder',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      db.updateAgentStatus('agent-1', 'failed', undefined, undefined, 'Network error');

      const result = db.getAgent('agent-1');
      expect(result?.status).toBe('failed');
      expect(result?.error).toBe('Network error');
    });
  });

  describe('createTask and getTask', () => {
    it('should create and retrieve task', () => {
      const task: Task = {
        id: 'task-1',
        description: 'Implement login',
        status: 'pending',
        dependencies: [],
        createdAt: Date.now(),
      };

      db.createTask(task);
      const result = db.getTask('task-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('task-1');
      expect(result?.description).toBe('Implement login');
      expect(result?.status).toBe('pending');
    });

    it('should store task dependencies', () => {
      const task: Task = {
        id: 'task-1',
        description: 'Implement login',
        status: 'pending',
        dependencies: ['task-0'],
        createdAt: Date.now(),
      };

      db.createTask(task);
      const result = db.getTask('task-1');

      expect(result?.dependencies).toEqual(['task-0']);
    });

    it('should return undefined for non-existent task', () => {
      const result = db.getTask('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('getTasks', () => {
    it('should return all tasks', () => {
      db.createTask({
        id: 'task-1',
        description: 'Task 1',
        status: 'pending',
        dependencies: [],
        createdAt: Date.now(),
      });
      db.createTask({
        id: 'task-2',
        description: 'Task 2',
        status: 'pending',
        dependencies: [],
        createdAt: Date.now(),
      });

      const result = db.getTasks();

      expect(result).toHaveLength(2);
    });

    it('should return empty array when no tasks', () => {
      const result = db.getTasks();
      expect(result).toEqual([]);
    });
  });

  describe('getTasksByAgent', () => {
    it('should return tasks assigned to agent', () => {
      db.createAgent({
        id: 'agent-1',
        role: 'coder',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      db.createTask({
        id: 'task-1',
        description: 'Task 1',
        status: 'in_progress',
        dependencies: [],
        agentId: 'agent-1',
        createdAt: Date.now(),
      });
      db.createTask({
        id: 'task-2',
        description: 'Task 2',
        status: 'pending',
        dependencies: [],
        createdAt: Date.now(),
      });

      const result = db.getTasksByAgent('agent-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('task-1');
    });
  });

  describe('updateTaskStatus', () => {
    it('should update task status', () => {
      db.createTask({
        id: 'task-1',
        description: 'Task 1',
        status: 'pending',
        dependencies: [],
        createdAt: Date.now(),
      });

      db.updateTaskStatus('task-1', 'in_progress');

      const result = db.getTask('task-1');
      expect(result?.status).toBe('in_progress');
    });

    it('should set completed_at when provided', () => {
      db.createTask({
        id: 'task-1',
        description: 'Task 1',
        status: 'pending',
        dependencies: [],
        createdAt: Date.now(),
      });

      const completedAt = Date.now();
      db.updateTaskStatus('task-1', 'completed', completedAt);

      const result = db.getTask('task-1');
      expect(result?.status).toBe('completed');
      expect(result?.completedAt).toBe(completedAt);
    });
  });

  describe('assignTaskToAgent', () => {
    it('should assign task to agent', () => {
      db.createAgent({
        id: 'agent-1',
        role: 'coder',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      db.createTask({
        id: 'task-1',
        description: 'Task 1',
        status: 'pending',
        dependencies: [],
        createdAt: Date.now(),
      });

      db.assignTaskToAgent('task-1', 'agent-1');

      const result = db.getTask('task-1');
      expect(result?.agentId).toBe('agent-1');
    });
  });

  describe('logEvent and getEvents', () => {
    it('should log and retrieve events', () => {
      db.createAgent({
        id: 'agent-1',
        role: 'coder',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      db.logEvent('agent-1', 'progress', { progress: 0.5 });
      db.logEvent('agent-1', 'complete', { result: 'Done' });

      const result = db.getEvents('agent-1');

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('progress');
      expect(result[1].type).toBe('complete');
    });

    it('should filter events by agent', () => {
      db.createAgent({
        id: 'agent-1',
        role: 'coder',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      db.createAgent({
        id: 'agent-2',
        role: 'reviewer',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      db.logEvent('agent-1', 'progress', { progress: 0.5 });
      db.logEvent('agent-2', 'progress', { progress: 0.3 });

      const result = db.getEvents('agent-1');

      expect(result).toHaveLength(1);
      expect(result[0].agentId).toBe('agent-1');
    });

    it('should return all events when no agent specified', () => {
      db.createAgent({
        id: 'agent-1',
        role: 'coder',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      db.logEvent('agent-1', 'progress', { progress: 0.5 });
      db.logEvent('agent-1', 'complete', { result: 'Done' });

      const result = db.getEvents();

      expect(result).toHaveLength(2);
    });

    it('should store event data as JSON', () => {
      db.createAgent({
        id: 'agent-1',
        role: 'coder',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      db.logEvent('agent-1', 'progress', { progress: 0.5, message: 'Half done' });

      const result = db.getEvents('agent-1');

      expect(result[0].data).toEqual({ progress: 0.5, message: 'Half done' });
    });

    it('should order events by timestamp ascending', () => {
      db.createAgent({
        id: 'agent-1',
        role: 'coder',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      db.logEvent('agent-1', 'progress', { step: 1 });
      db.logEvent('agent-1', 'progress', { step: 2 });
      db.logEvent('agent-1', 'progress', { step: 3 });

      const result = db.getEvents('agent-1');

      expect(result[0].data).toEqual({ step: 1 });
      expect(result[1].data).toEqual({ step: 2 });
      expect(result[2].data).toEqual({ step: 3 });
    });
  });
});
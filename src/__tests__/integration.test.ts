import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { coordinatorManager } from '../lib/coordinator-manager.js';
import { SwarmStateDB } from '../lib/state.js';
import type { Agent, Task } from '../types.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock the client for testing
const createMockClient = () => ({
  session: {
    create: vi.fn().mockResolvedValue({ id: 'mock-session-id' }),
    abort: vi.fn().mockResolvedValue(undefined),
  },
} as any);

describe('Integration Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'integration-test-'));
    coordinatorManager.setBasePath(tempDir);
    coordinatorManager.setClient(createMockClient());
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    // Reset coordinator manager for clean state in next test
    coordinatorManager['swarms'].clear();
    coordinatorManager['activeSwarmId'] = null;
  });

  it('should create swarm, spawn agents, and track progress', async () => {
    // Step 1: Initialize a swarm
    const { swarmId, plannerAgentId } = await coordinatorManager.initSwarmForTask('Test task', 'root-session-1');
    
    // Verify swarm was created
    expect(swarmId).toBeDefined();
    expect(plannerAgentId).toBeDefined();
    
    // Step 2: Get the coordinator and verify initial state
    const coordinator = coordinatorManager.getCoordinator(swarmId);
    expect(coordinator).toBeDefined();
    
    const initialStatus = coordinatorManager.getSwarmStatus(swarmId);
    expect(initialStatus).toBeDefined();
    expect(initialStatus?.swarm?.id).toBe(swarmId);
    expect(initialStatus?.agents).toHaveLength(1); // Planner agent
    expect(initialStatus?.agents[0].role).toBe('planner');
    
    // Step 3: Spawn additional agents
    const task = await coordinator!.createTask('Implementation task');
    const coderAgent = await coordinator!.spawnAgent({
      role: 'coder',
      taskId: task.id,
      context: 'Implement the feature',
      parentSessionId: 'root-session-1'
    });
    
    // Verify new agent was created
    const statusAfterSpawn = coordinatorManager.getSwarmStatus(swarmId);
    expect(statusAfterSpawn?.agents).toHaveLength(2); // Planner + Coder
    
    // Step 4: Report progress
    await coordinatorManager.reportProgress({
      agentId: coderAgent.id,
      progress: 0.5,
      message: 'Halfway done'
    });
    
    // Verify progress was recorded
    const statusAfterProgress = coordinatorManager.getSwarmStatus(swarmId);
    const updatedCoderAgent = statusAfterProgress?.agents.find(a => a.id === coderAgent.id);
    expect(updatedCoderAgent?.progress).toBe(0.5);
    
    // Step 5: Complete the agent
    await coordinatorManager.completeCurrentAgent(coderAgent.id, 'Feature implemented');
    
    // Verify agent completed
    const statusAfterCompletion = coordinatorManager.getSwarmStatus(swarmId);
    const completedCoderAgent = statusAfterCompletion?.agents.find(a => a.id === coderAgent.id);
    expect(completedCoderAgent?.status).toBe('completed');
    expect(completedCoderAgent?.result).toBe('Feature implemented');
    
    // Step 6: Verify task status
    const completedTask = statusAfterCompletion?.tasks.find(t => t.id === task.id);
    expect(completedTask?.status).toBe('completed');
  });

  it('should handle handoffs between agents', async () => {
    // Initialize swarm
    const { swarmId } = await coordinatorManager.initSwarmForTask('Handoff test', 'root-session-1');
    const coordinator = coordinatorManager.getCoordinator(swarmId);
    
    // Create tasks and agents
    const task1 = await coordinator!.createTask('Implementation task');
    const task2 = await coordinator!.createTask('Review task');
    
    const implAgent = await coordinator!.spawnAgent({
      role: 'coder',
      taskId: task1.id,
      context: 'Implement feature',
      parentSessionId: 'root-session-1'
    });
    
    const reviewAgent = await coordinator!.spawnAgent({
      role: 'reviewer',
      taskId: task2.id,
      context: 'Review implementation',
      parentSessionId: 'root-session-1'
    });
    
    // Perform handoff from implementation agent to review agent
    await coordinatorManager.handleHandoff({
      taskId: task2.id,
      fromAgentId: implAgent.id,
      toAgentId: reviewAgent.id,
      context: 'Implementation complete, please review',
      files: ['feature.ts', 'utils.ts'],
      decisions: ['Used JWT for auth', 'Applied caching']
    });
    
    // Verify handoff was recorded by checking if handoff file was created
    const db = coordinator!.getDb();
    const events = db.getEvents(implAgent.id);
    const handoffEvent = events.find(e => e.type === 'handoff');
    
    expect(handoffEvent).toBeDefined();
    expect(handoffEvent?.data).toHaveProperty('taskId', task2.id);
    expect(handoffEvent?.data).toHaveProperty('files');
  });

  it('should handle swarm abortion', async () => {
    // Initialize swarm
    const { swarmId } = await coordinatorManager.initSwarmForTask('Abortion test', 'root-session-1');
    
    // Spawn an agent
    const coordinator = coordinatorManager.getCoordinator(swarmId);
    const task = await coordinator!.createTask('Test task');
    const agent = await coordinator!.spawnAgent({
      role: 'coder',
      taskId: task.id,
      context: 'Implement feature',
      parentSessionId: 'root-session-1'
    });
    
    // Verify agent is running
    let status = coordinatorManager.getSwarmStatus(swarmId);
    const runningAgent = status?.agents.find(a => a.id === agent.id);
    expect(runningAgent?.status).toBe('running');
    
    // Abort the swarm
    await coordinatorManager.abortSwarm();
    
    // Verify all agents are marked as failed
    status = coordinatorManager.getSwarmStatus(swarmId);
    expect(status?.swarm?.status).toBe('aborted');
    expect(status?.agents.every(a => a.status === 'failed')).toBe(true);
  });

  it('should handle concurrent swarms without interference', async () => {
    // Create multiple swarms
    const swarm1Result = await coordinatorManager.initSwarmForTask('Swarm 1 task', 'root-session-1');
    coordinatorManager.setActiveSwarm(swarm1Result.swarmId);
    
    const swarm2Result = await coordinatorManager.initSwarmForTask('Swarm 2 task', 'root-session-2');
    
    // Verify both swarms exist independently
    const status1 = coordinatorManager.getSwarmStatus(swarm1Result.swarmId);
    const status2 = coordinatorManager.getSwarmStatus(swarm2Result.swarmId);
    
    expect(status1).toBeDefined();
    expect(status2).toBeDefined();
    expect(status1?.swarm?.id).toBe(swarm1Result.swarmId);
    expect(status2?.swarm?.id).toBe(swarm2Result.swarmId);
    
    // Each swarm should have its own planner
    expect(status1?.agents).toHaveLength(1);
    expect(status2?.agents).toHaveLength(1);
    expect(status1?.agents[0].role).toBe('planner');
    expect(status2?.agents[0].role).toBe('planner');
    
    // Operate on each swarm independently
    const coordinator1 = coordinatorManager.getCoordinator(swarm1Result.swarmId);
    const coordinator2 = coordinatorManager.getCoordinator(swarm2Result.swarmId);
    
    // Create different tasks for each swarm
    const task1 = await coordinator1!.createTask('Swarm 1 specific task');
    const task2 = await coordinator2!.createTask('Swarm 2 specific task');
    
    // Spawn different agents for each swarm
    const agent1 = await coordinator1!.spawnAgent({
      role: 'coder',
      taskId: task1.id,
      context: 'Work on swarm 1',
      parentSessionId: 'root-session-1'
    });
    
    const agent2 = await coordinator2!.spawnAgent({
      role: 'reviewer',
      taskId: task2.id,
      context: 'Work on swarm 2',
      parentSessionId: 'root-session-2'
    });
    
    // Verify agents are in correct swarms
    const updatedStatus1 = coordinatorManager.getSwarmStatus(swarm1Result.swarmId);
    const updatedStatus2 = coordinatorManager.getSwarmStatus(swarm2Result.swarmId);
    
    expect(updatedStatus1?.agents).toHaveLength(2); // planner + coder
    expect(updatedStatus2?.agents).toHaveLength(2); // planner + reviewer
    
    // Verify correct roles in each swarm
    const swarm1Coder = updatedStatus1?.agents.find(a => a.id === agent1.id);
    const swarm2Reviewer = updatedStatus2?.agents.find(a => a.id === agent2.id);
    
    expect(swarm1Coder?.role).toBe('coder');
    expect(swarm2Reviewer?.role).toBe('reviewer');
    
    // Report progress separately - must set active swarm for each
    coordinatorManager.setActiveSwarm(swarm1Result.swarmId);
    await coordinatorManager.reportProgress({
      agentId: agent1.id,
      progress: 0.6,
      message: 'Swarm 1 progress'
    });
    
    coordinatorManager.setActiveSwarm(swarm2Result.swarmId);
    await coordinatorManager.reportProgress({
      agentId: agent2.id,
      progress: 0.8,
      message: 'Swarm 2 progress'
    });
    
    // Verify progress is isolated
    const finalStatus1 = coordinatorManager.getSwarmStatus(swarm1Result.swarmId);
    const finalStatus2 = coordinatorManager.getSwarmStatus(swarm2Result.swarmId);
    
    const finalAgent1 = finalStatus1?.agents.find(a => a.id === agent1.id);
    const finalAgent2 = finalStatus2?.agents.find(a => a.id === agent2.id);
    
    expect(finalAgent1?.progress).toBe(0.6);
    expect(finalAgent2?.progress).toBe(0.8);
  });
});
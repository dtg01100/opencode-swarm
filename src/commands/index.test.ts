import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/coordinator-manager.js', () => ({
  coordinatorManager: {
    initSwarmForTask: vi.fn(),
    getSwarmStatus: vi.fn(),
    getCoordinator: vi.fn(),
    abortSwarm: vi.fn(),
  },
}));

import { swarmCommands, registerCommands } from './index.js';
import { coordinatorManager } from '../lib/coordinator-manager.js';

interface MockSwarmContext {
  client: {
    session: { id: string };
    tui: { onCommand: ReturnType<typeof vi.fn> };
    app?: { log: ReturnType<typeof vi.fn> };
  };
}

describe('swarm commands', () => {
  let ctx: MockSwarmContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = {
      client: {
        session: { id: 'session-123' },
        tui: { onCommand: vi.fn() },
        app: { log: vi.fn() },
      },
    } as unknown as MockSwarmContext;
  });

  it('registerCommands should register all commands with tui', () => {
    registerCommands(ctx as any);
    expect(ctx.client.tui.onCommand).toHaveBeenCalledWith('/swarm', expect.any(Function));
    expect(ctx.client.tui.onCommand).toHaveBeenCalledWith('/swarm-status', expect.any(Function));
    expect(ctx.client.tui.onCommand).toHaveBeenCalledWith('/swarm-abort', expect.any(Function));
  });

  describe('/swarm handler', () => {
    it('returns usage when no args provided', async () => {
      const res = await swarmCommands['/swarm'].handler('   ', ctx as any);
      expect(res.success).toBe(false);
      expect(res.message).toContain('Usage: /swarm');
    });

    it('starts swarm and returns success message', async () => {
      vi.mocked(coordinatorManager.initSwarmForTask).mockResolvedValue({ swarmId: 'swarm-abc-123', plannerAgentId: 'planner-xyz' });

      const res = await swarmCommands['/swarm'].handler('Implement auth', ctx as any);

      expect(res.success).toBe(true);
      expect(res.message).toContain('Swarm started');
      expect(res.message).toContain('Swarm ID:');
      expect(coordinatorManager.initSwarmForTask).toHaveBeenCalledWith('Implement auth', 'session-123');
    });
  });

  describe('/swarm-status handler', () => {
    it('returns no active swarm message when no status', async () => {
      vi.mocked(coordinatorManager.getSwarmStatus).mockReturnValue(null);
      const res = await swarmCommands['/swarm-status'].handler('', ctx as any);
      expect(res.success).toBe(false);
      expect(res.message).toContain('No active swarm');
    });

    it('returns formatted status when present', async () => {
      vi.mocked(coordinatorManager.getSwarmStatus).mockReturnValue({
        swarm: { id: 's1', status: 'executing' as const, rootSessionId: 'root', createdAt: Date.now(), updatedAt: Date.now() },
        agents: [{ id: 'a1', role: 'coder' as const, status: 'running' as const, progress: 0.5, createdAt: Date.now(), updatedAt: Date.now() }],
        tasks: [{ id: 't1', description: 'Task 1', status: 'in_progress' as const, dependencies: [], createdAt: Date.now() }],
      });

      const res = await swarmCommands['/swarm-status'].handler('', ctx as any);
      expect(res.success).toBe(true);
      expect(res.message).toContain('Swarm Status');
      expect(res.message).toContain('Agents');
      expect(res.message).toContain('Tasks');
    });
  });

  describe('/swarm-abort handler', () => {
    it('returns error when no coordinator', async () => {
      vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(null);
      const res = await swarmCommands['/swarm-abort'].handler('', ctx as any);
      expect(res.success).toBe(false);
      expect(res.message).toContain('No active swarm');
    });

    it('aborts swarm when coordinator exists', async () => {
      vi.mocked(coordinatorManager.getCoordinator).mockReturnValue({} as any);
      vi.mocked(coordinatorManager.abortSwarm).mockResolvedValue(undefined);

      const res = await swarmCommands['/swarm-abort'].handler('', ctx as any);
      expect(res.success).toBe(true);
      expect(res.message).toContain('Swarm aborted');
      expect(coordinatorManager.abortSwarm).toHaveBeenCalled();
    });
  });
});

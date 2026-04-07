import { describe, it, expect, beforeEach, vi } from 'vitest';
import { swarmSpawnTool, swarmBroadcastTool, swarmProgressTool, swarmCompleteTool, swarmHandoffTool, swarmStatusTool, swarmAbortTool, swarmInitTool, setPluginContext, } from './index.js';
import { coordinatorManager } from '../lib/coordinator-manager.js';
// Helper to parse JSON responses from tools
function parseResult(result) {
    return JSON.parse(result);
}
vi.mock('../lib/coordinator-manager.js', () => ({
    coordinatorManager: {
        initSwarmForTask: vi.fn(),
        getCoordinator: vi.fn(),
        getSwarmStatus: vi.fn(),
        spawnWorkerAgent: vi.fn(),
        reportProgress: vi.fn(),
        completeCurrentAgent: vi.fn(),
        handleHandoff: vi.fn(),
        broadcast: vi.fn(),
        abortSwarm: vi.fn(),
        isSwarmComplete: vi.fn(),
        hasFailedTasks: vi.fn(),
    },
}));
const mockCoordinator = {
    spawnAgent: vi.fn(),
    getAgents: vi.fn(),
    logEvent: vi.fn(),
};
describe('swarm tools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setPluginContext({});
    });
    describe('swarmSpawnTool', () => {
        it('should return error when no active swarm', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(null);
            const result = await swarmSpawnTool.execute({ role: 'coder', taskId: 'task-1' }, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error).toContain('No active swarm');
        });
        it('should spawn agent successfully', async () => {
            const mockAgent = {
                id: 'agent-1',
                role: 'coder',
                status: 'running',
                progress: 0,
            };
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(mockCoordinator);
            vi.mocked(mockCoordinator.spawnAgent).mockResolvedValue(mockAgent);
            const result = await swarmSpawnTool.execute({ role: 'coder', taskId: 'task-1' }, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(true);
            expect(parsed.agentId).toBe('agent-1');
            expect(parsed.role).toBe('coder');
        });
    });
    describe('swarmBroadcastTool', () => {
        it('should return error when no active swarm', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(null);
            const result = await swarmBroadcastTool.execute({ message: 'Hello' }, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(false);
        });
        it('should broadcast message successfully', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(mockCoordinator);
            vi.mocked(coordinatorManager.broadcast).mockResolvedValue(undefined);
            const result = await swarmBroadcastTool.execute({ message: 'Hello agents' }, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(true);
            expect(coordinatorManager.broadcast).toHaveBeenCalledWith('Hello agents', undefined);
        });
        it('should include fromAgentId when provided', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(mockCoordinator);
            vi.mocked(coordinatorManager.broadcast).mockResolvedValue(undefined);
            await swarmBroadcastTool.execute({ message: 'Hello', fromAgentId: 'agent-1' }, {});
            expect(coordinatorManager.broadcast).toHaveBeenCalledWith('Hello', 'agent-1');
        });
    });
    describe('swarmProgressTool', () => {
        it('should return error when no active swarm', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(null);
            const result = await swarmProgressTool.execute({ agentId: 'agent-1', progress: 0.5 }, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(false);
        });
        it('should report progress successfully', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(mockCoordinator);
            vi.mocked(coordinatorManager.reportProgress).mockResolvedValue(undefined);
            const result = await swarmProgressTool.execute({ agentId: 'agent-1', progress: 0.75, message: 'Half done' }, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(true);
            expect(parsed.progress).toBe(75);
        });
        it('should calculate percentage correctly', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(mockCoordinator);
            vi.mocked(coordinatorManager.reportProgress).mockResolvedValue(undefined);
            const result = await swarmProgressTool.execute({ agentId: 'agent-1', progress: 0.25 }, {});
            const parsed = parseResult(result);
            expect(parsed.progress).toBe(25);
        });
    });
    describe('swarmCompleteTool', () => {
        it('should return error when no active swarm', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(null);
            const result = await swarmCompleteTool.execute({ agentId: 'agent-1', result: 'Done!' }, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(false);
        });
        it('should complete agent successfully', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(mockCoordinator);
            vi.mocked(coordinatorManager.completeCurrentAgent).mockResolvedValue(undefined);
            vi.mocked(coordinatorManager.getSwarmStatus).mockReturnValue({
                swarm: null,
                agents: [],
                tasks: [],
            });
            vi.mocked(coordinatorManager.isSwarmComplete).mockReturnValue(false);
            vi.mocked(coordinatorManager.hasFailedTasks).mockReturnValue(false);
            const result = await swarmCompleteTool.execute({ agentId: 'agent-1', result: 'Implemented feature X', files: ['file1.ts'] }, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(true);
            expect(parsed.result).toBe('Implemented feature X');
        });
        it('should indicate swarm completion status', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(mockCoordinator);
            vi.mocked(coordinatorManager.completeCurrentAgent).mockResolvedValue(undefined);
            vi.mocked(coordinatorManager.getSwarmStatus).mockReturnValue({
                swarm: null,
                agents: [{ id: 'a1' }],
                tasks: [],
            });
            vi.mocked(coordinatorManager.isSwarmComplete).mockReturnValue(true);
            vi.mocked(coordinatorManager.hasFailedTasks).mockReturnValue(false);
            const result = await swarmCompleteTool.execute({ agentId: 'agent-1', result: 'Done' }, {});
            const parsed = parseResult(result);
            expect(parsed.swarmComplete).toBe(true);
        });
    });
    describe('swarmHandoffTool', () => {
        it('should return error when no active swarm', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(null);
            const result = await swarmHandoffTool.execute({ taskId: 'task-1', fromAgentId: 'agent-1', context: 'Context here' }, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(false);
        });
        it('should handle handoff successfully', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(mockCoordinator);
            vi.mocked(coordinatorManager.handleHandoff).mockResolvedValue(undefined);
            const result = await swarmHandoffTool.execute({
                taskId: 'task-2',
                fromAgentId: 'agent-1',
                context: 'Work completed',
                files: ['file1.ts', 'file2.ts'],
                decisions: ['Used JWT for auth'],
                toAgentId: 'agent-2',
            }, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(true);
            expect(parsed.taskId).toBe('task-2');
        });
    });
    describe('swarmStatusTool', () => {
        it('should return error when no active swarm', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(null);
            const result = await swarmStatusTool.execute({}, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(false);
        });
        it('should return swarm status', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(mockCoordinator);
            vi.mocked(coordinatorManager.getSwarmStatus).mockReturnValue({
                swarm: {
                    id: 'swarm-1',
                    rootSessionId: 'session-1',
                    status: 'executing',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
                agents: [
                    { id: 'agent-1', role: 'coder', status: 'running', progress: 0.5, createdAt: Date.now(), updatedAt: Date.now() },
                ],
                tasks: [
                    { id: 'task-1', description: 'Build feature', status: 'in_progress', dependencies: [], createdAt: Date.now() },
                ],
            });
            const result = await swarmStatusTool.execute({}, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(true);
            expect(parsed.agents).toHaveLength(1);
            expect(parsed.tasks).toHaveLength(1);
        });
    });
    describe('swarmAbortTool', () => {
        it('should return error when no active swarm', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(null);
            const result = await swarmAbortTool.execute({}, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(false);
        });
        it('should abort swarm successfully', async () => {
            vi.mocked(coordinatorManager.getCoordinator).mockReturnValue(mockCoordinator);
            vi.mocked(coordinatorManager.abortSwarm).mockResolvedValue(undefined);
            const result = await swarmAbortTool.execute({}, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(true);
        });
    });
    describe('swarmInitTool', () => {
        it('should initialize swarm successfully', async () => {
            vi.mocked(coordinatorManager.initSwarmForTask).mockResolvedValue({
                swarmId: 'swarm-1',
                plannerAgentId: 'planner-1',
            });
            const result = await swarmInitTool.execute({ taskDescription: 'Build auth', sessionId: 'session-1' }, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(true);
            expect(parsed.swarmId).toBe('swarm-1');
            expect(parsed.plannerAgentId).toBe('planner-1');
        });
        it('should return error on failure', async () => {
            vi.mocked(coordinatorManager.initSwarmForTask).mockRejectedValue(new Error('Failed to initialize'));
            const result = await swarmInitTool.execute({ taskDescription: 'Build auth', sessionId: 'session-1' }, {});
            const parsed = parseResult(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error).toContain('Failed to initialize');
        });
    });
});

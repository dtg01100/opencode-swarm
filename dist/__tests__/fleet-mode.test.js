import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoordinatorManager } from '../lib/coordinator-manager.js';
import { createAggregator } from '../lib/aggregator.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
describe('Fleet mode simulation', () => {
    let baseDir;
    beforeEach(() => {
        baseDir = mkdtempSync(join(tmpdir(), 'fleet-test-'));
    });
    afterEach(() => {
        try {
            rmSync(baseDir, { recursive: true, force: true });
        }
        catch { }
    });
    it('runs multiple swarms concurrently and aggregates results', async () => {
        const manager = new CoordinatorManager();
        manager.setBasePath(baseDir);
        const mockClient = {
            session: {
                create: vi.fn().mockResolvedValue({ id: 'child-session' }),
                abort: vi.fn().mockResolvedValue(undefined),
            },
        };
        manager.setClient(mockClient);
        const swarmCount = 3;
        const aggregated = [];
        for (let i = 0; i < swarmCount; i++) {
            const swarmId = await manager.createSwarm(`root-${i}`);
            manager.setActiveSwarm(swarmId);
            const coordinator = manager.getCoordinator(swarmId);
            const task = await coordinator.createTask(`Task ${i}`);
            const agent = await coordinator.spawnAgent({ role: 'coder', taskId: task.id });
            // simulate progress and completion
            await coordinator.reportProgress({ agentId: agent.id, progress: 1, message: 'done' });
            await coordinator.completeAgent(agent.id, `Result for ${i}`);
            const agg = createAggregator(coordinator.getDb());
            aggregated.push(agg.aggregateResults());
        }
        expect(aggregated).toHaveLength(swarmCount);
        for (const res of aggregated) {
            expect(res.totalTasks).toBeGreaterThan(0);
            expect(res.completedTasks).toBe(res.totalTasks);
            expect(res.failedTasks).toBe(0);
        }
    });
});

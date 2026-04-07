import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { CoordinatorManager } from './coordinator-manager.js';
import Orchestrator from './orchestrator.js';
function createMockClient() {
    return {
        session: {
            create: async () => ({ data: { id: 's' + Math.random().toString(36).slice(2) } }),
            abort: async () => { },
        },
    };
}
async function waitFor(cond, timeout = 2000, interval = 20) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (await cond())
            return true;
        await new Promise(r => setTimeout(r, interval));
    }
    throw new Error('timeout waiting');
}
describe('Orchestrator', () => {
    let manager;
    let tempDir;
    let orch;
    beforeEach(() => {
        manager = new CoordinatorManager();
        tempDir = mkdtempSync(join(tmpdir(), 'orch-test-'));
        manager.setBasePath(tempDir);
        manager.setClient(createMockClient());
        orch = new Orchestrator(manager, tempDir);
        manager.setOrchestrator(orch);
    });
    afterEach(() => {
        try {
            orch.stop();
        }
        catch { }
        rmSync(tempDir, { recursive: true, force: true });
    });
    it('schedules tasks by priority and assigns to swarms', async () => {
        orch.start();
        // submit low priority then high priority
        const low = manager.submitGlobalTask ? manager.submitGlobalTask('low task', 1) : orch.submitGlobalTask('low task', 1);
        const high = manager.submitGlobalTask ? manager.submitGlobalTask('high task', 10) : orch.submitGlobalTask('high task', 10);
        // wait for two tasks to be created in swarm
        await waitFor(() => {
            const status = manager.getSwarmStatus();
            return !!status && status.tasks.length >= 2;
        });
        const status = manager.getSwarmStatus();
        expect(status).not.toBeNull();
        const descs = status.tasks.map(t => t.description);
        // highest priority should be scheduled first
        expect(descs[0]).toContain('high task');
    });
    it('handles cross-swarm dependencies', async () => {
        orch.start();
        // submit first task
        manager.submitGlobalTask ? manager.submitGlobalTask('base task', 5) : orch.submitGlobalTask('base task', 5);
        // wait for it to be scheduled
        await waitFor(() => {
            const s = manager.getSwarmStatus();
            return !!s && s.tasks.length >= 1;
        });
        const s1 = manager.getSwarmStatus();
        const baseTask = s1.tasks[0];
        // submit dependent task referencing baseTask.id
        manager.submitGlobalTask ? manager.submitGlobalTask('dependent task', 1, [baseTask.id]) : orch.submitGlobalTask('dependent task', 1, [baseTask.id]);
        // ensure dependent is not scheduled while base is not completed
        await new Promise(r => setTimeout(r, 200));
        let status = manager.getSwarmStatus();
        // dependent should not be scheduled yet (only one task exists)
        expect(status.tasks.find(t => t.description.includes('dependent'))).toBeUndefined();
        // Wait for agent to be spawned for base task
        await waitFor(() => {
            const s = manager.getSwarmStatus();
            return !!s && s.agents.length > 0;
        });
        // complete base task by completing its agent
        const agent = manager.getSwarmStatus().agents[0];
        await manager.completeCurrentAgent(agent.id, 'done');
        // wait for dependent to be scheduled
        await waitFor(() => {
            const s = manager.getSwarmStatus();
            return !!s && s.tasks.some(t => t.description.includes('dependent'));
        });
        status = manager.getSwarmStatus();
        expect(status.tasks.some(t => t.description.includes('dependent'))).toBe(true);
    });
});

import { coordinatorManager } from './coordinator-manager.js';
import { createSwarmStateDB } from './state.js';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { writeFileSync, readFileSync } from 'fs';
export class Orchestrator {
    manager;
    basePath;
    queue = [];
    running = false;
    intervalMs = 50;
    timer = null;
    queueFile;
    constructor(manager = coordinatorManager, basePath = '.opencode/swarm') {
        this.manager = manager;
        this.basePath = basePath;
        this.queueFile = join(this.basePath, 'orchestrator-queue.json');
        // Load persisted queue if present
        try {
            if (existsSync(this.queueFile)) {
                const raw = readFileSync(this.queueFile, 'utf-8');
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed))
                    this.queue = parsed;
            }
        }
        catch (e) {
            // ignore parse errors
            this.queue = [];
        }
    }
    submitGlobalTask(description, priority = 0, dependencies = [], rootSessionId) {
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        this.queue.push({ id, description, priority, dependencies, rootSessionId });
        // keep queue sorted by priority desc, then FIFO
        this.queue.sort((a, b) => b.priority - a.priority);
        // persist queue to disk
        try {
            writeFileSync(this.queueFile, JSON.stringify(this.queue), { encoding: 'utf-8' });
        }
        catch (e) {
            // ignore
        }
        return id;
    }
    start() {
        if (this.running)
            return;
        this.running = true;
        this.timer = setInterval(() => void this.scheduleOnce(), this.intervalMs);
    }
    stop() {
        if (!this.running)
            return;
        this.running = false;
        if (this.timer)
            clearInterval(this.timer);
        this.timer = null;
    }
    scheduleOnce = async () => {
        if (!this.queue.length)
            return;
        // pick highest priority task
        const task = this.queue[0];
        // ensure dependencies are satisfied across all swarm DBs
        const depsOk = this.checkDependencies(task.dependencies);
        if (!depsOk)
            return; // wait until later
        try {
            // pick active coordinator if available and under per-swarm concurrency
            let coordinator = this.manager.getCoordinator();
            let useNew = false;
            if (coordinator) {
                const runningAgents = coordinator.getAgents().filter(a => a.status === 'running').length;
                const maxConc = this.manager.getConfig().maxConcurrentAgents ?? Infinity;
                if (runningAgents >= maxConc)
                    useNew = true;
            }
            else {
                useNew = true;
            }
            if (useNew) {
                const root = task.rootSessionId ?? 'orchestrator-root';
                await this.manager.createSwarm(root);
                coordinator = this.manager.getCoordinator();
            }
            if (!coordinator)
                return;
            // create task in coordinator and spawn agent
            const created = await coordinator.createTask(task.description, task.dependencies);
            await coordinator.spawnAgent({ role: 'worker', taskId: created.id, parentSessionId: task.rootSessionId });
            // remove from queue and persist
            this.queue.shift();
            try {
                writeFileSync(this.queueFile, JSON.stringify(this.queue), { encoding: 'utf-8' });
            }
            catch (e) {
                // ignore
            }
        }
        catch (err) {
            // scheduling failed; leave in queue for retry
        }
    };
    checkDependencies(deps) {
        if (!deps || deps.length === 0)
            return true;
        try {
            const files = readdirSync(this.basePath);
            // look for .db files and ensure each dependency exists and completed
            for (const dep of deps) {
                let found = false;
                for (const f of files) {
                    if (!f.endsWith('.db'))
                        continue;
                    const swarmId = f.replace(/\.db$/, '');
                    const db = createSwarmStateDB(swarmId, this.basePath);
                    const task = db.getTask(dep);
                    if (task) {
                        found = true;
                        if (task.status !== 'completed')
                            return false;
                    }
                }
                if (!found)
                    return false;
            }
            return true;
        }
        catch (e) {
            return false;
        }
    }
}
export default Orchestrator;

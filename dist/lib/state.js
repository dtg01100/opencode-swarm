import { join, dirname } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
export class SwarmStateDB {
    filePath;
    swarmId;
    state;
    constructor(swarmId, dbPath) {
        this.swarmId = swarmId;
        // Support two layouts: a basePath that is a directory (join(basePath, `${swarmId}.db`))
        // or a path that already points to .opencode/swarm/{swarmId}/state.db (dbPath may be a directory or full path)
        const candidate = join(dbPath, `${swarmId}.db`);
        this.filePath = candidate;
        // ensure directory exists
        mkdirSync(dirname(this.filePath), { recursive: true });
        if (existsSync(this.filePath)) {
            try {
                const raw = readFileSync(this.filePath, 'utf8');
                this.state = JSON.parse(raw);
            }
            catch (e) {
                console.warn(`Failed to parse state file ${this.filePath}, reinitializing: ${e instanceof Error ? e.message : String(e)}`);
                // if parse fails, reinitialize
                this.state = { swarm: null, agents: [], tasks: [], events: [] };
                try {
                    writeFileSync(this.filePath, JSON.stringify(this.state));
                }
                catch (writeErr) {
                    console.error(`Failed to reinitialize state file ${this.filePath}: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`);
                    throw new Error(`Failed to initialize state file: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`);
                }
            }
        }
        else {
            try {
                this.state = { swarm: null, agents: [], tasks: [], events: [] };
                writeFileSync(this.filePath, JSON.stringify(this.state));
            }
            catch (error) {
                console.error(`Failed to create initial state file ${this.filePath}: ${error instanceof Error ? error.message : String(error)}`);
                throw new Error(`Failed to create initial state: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    pendingWrites = 0;
    flushTimer = null;
    flushInterval = 100; // ms
    maxPendingWrites = 10; // Max writes to buffer before forced flush
    /**
     * Schedule a write to disk, with debouncing to prevent excessive I/O
     */
    schedulePersist() {
        this.pendingWrites++;
        // If we've hit the max pending writes, flush immediately
        if (this.pendingWrites >= this.maxPendingWrites) {
            this.flush();
            return;
        }
        // Otherwise, debounce the writes
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
        }
        this.flushTimer = setTimeout(() => {
            this.flush();
        }, this.flushInterval);
    }
    /**
     * Force write the current state to disk
     */
    flush() {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        try {
            // Ensure directory exists before writing
            const dir = dirname(this.filePath);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
            writeFileSync(this.filePath, JSON.stringify(this.state));
            this.pendingWrites = 0;
        }
        catch (error) {
            console.error(`Failed to persist state to ${this.filePath}: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(`Failed to persist state: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    createSwarm(state) {
        this.state.swarm = state;
        this.schedulePersist();
    }
    getSwarm() {
        return this.state.swarm ?? undefined;
    }
    updateSwarmStatus(status) {
        if (!this.state.swarm)
            return;
        this.state.swarm.status = status;
        this.state.swarm.updatedAt = Date.now();
        this.schedulePersist();
    }
    updatePlannerSession(sessionId) {
        if (!this.state.swarm)
            return;
        this.state.swarm.plannerSessionId = sessionId;
        this.state.swarm.updatedAt = Date.now();
        this.schedulePersist();
    }
    createAgent(agent) {
        this.state.agents.push(agent);
        this.schedulePersist();
    }
    getAgent(id) {
        return this.state.agents.find(a => a.id === id);
    }
    getAgents() {
        return [...this.state.agents];
    }
    updateAgentStatus(id, status, progress, result, error) {
        const agent = this.state.agents.find(a => a.id === id);
        if (!agent)
            return;
        agent.status = status;
        agent.updatedAt = Date.now();
        if (progress !== undefined)
            agent.progress = progress;
        if (result !== undefined)
            agent.result = result;
        if (error !== undefined)
            agent.error = error;
        this.schedulePersist();
    }
    createTask(task) {
        // Ensure dependencies array exists and default priority
        const t = { ...task, dependencies: task.dependencies ?? [], priority: task.priority ?? 0 };
        this.state.tasks.push(t);
        this.schedulePersist();
    }
    getTask(id) {
        return this.state.tasks.find(t => t.id === id);
    }
    getTasks() {
        return [...this.state.tasks];
    }
    getTasksByAgent(agentId) {
        return this.state.tasks.filter(t => t.agentId === agentId);
    }
    updateTaskStatus(id, status, completedAt) {
        const task = this.state.tasks.find(t => t.id === id);
        if (!task)
            return;
        task.status = status;
        if (completedAt !== undefined)
            task.completedAt = completedAt;
        this.schedulePersist();
    }
    assignTaskToAgent(taskId, agentId) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (!task)
            return;
        task.agentId = agentId;
        this.schedulePersist();
    }
    logEvent(agentId, type, data) {
        const id = (this.state.events.length ? this.state.events[this.state.events.length - 1].id + 1 : 1);
        const ev = { id, agentId, type, data, timestamp: Date.now() };
        this.state.events.push(ev);
        this.schedulePersist();
    }
    getEvents(agentId) {
        const list = agentId ? this.state.events.filter(e => e.agentId === agentId) : this.state.events;
        return [...list].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    }
    close() {
        // Force flush any pending writes on close
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flush(); // Force a final flush
        }
    }
}
export function createSwarmStateDB(swarmId, basePath) {
    return new SwarmStateDB(swarmId, basePath);
}

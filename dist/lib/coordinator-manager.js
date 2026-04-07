import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { SwarmStateDB } from './state.js';
import { buildAgentSystemPrompt, getRoleDefinition } from './roles.js';
import { swarmTelemetry } from './telemetry.js';
export class CoordinatorManager {
    basePath = '.opencode/swarm';
    client = null;
    swarms = new Map();
    activeSwarmId = null;
    // Global orchestration: task queue and metadata
    globalTaskQueue = new Map();
    // Orchestrator integration (optional)
    orchestrator = null;
    setOrchestrator(orch) {
        this.orchestrator = orch;
    }
    startOrchestrator() {
        if (!this.orchestrator)
            throw new Error('No orchestrator set');
        if (typeof this.orchestrator.start === 'function')
            this.orchestrator.start();
    }
    stopOrchestrator() {
        if (!this.orchestrator)
            throw new Error('No orchestrator set');
        if (typeof this.orchestrator.stop === 'function')
            this.orchestrator.stop();
    }
    submitGlobalTask(description, priority = 0, dependencies = [], rootSessionId) {
        if (!this.orchestrator)
            throw new Error('No orchestrator set');
        if (typeof this.orchestrator.submitGlobalTask === 'function') {
            try {
                return this.orchestrator.submitGlobalTask(description, priority, dependencies, rootSessionId);
            }
            catch (error) {
                throw new Error(`Failed to submit global task: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        throw new Error('Orchestrator does not implement submitGlobalTask');
    }
    // autoscaling / spawn config
    config = {
        maxConcurrentAgents: Number(process.env.OPENCODE_SWARM_MAX_CONCURRENT_AGENTS ?? 5),
        maxRssBytes: Number(process.env.OPENCODE_SWARM_MAX_RSS_BYTES ?? 1_500_000_000),
        maxLoadAvg: Number(process.env.OPENCODE_SWARM_MAX_LOAD_AVG ?? 4),
        backoffBaseSeconds: Number(process.env.OPENCODE_SWARM_BACKOFF_BASE_SECONDS ?? 5),
    };
    setConfig(cfg) {
        this.config = { ...this.config, ...cfg };
    }
    getConfig() {
        return this.config;
    }
    async getResourceStatus() {
        const mem = process.memoryUsage();
        const totalMem = mem.rss;
        const usedHeap = mem.heapUsed;
        const os = await import('os');
        const cfg = this.getConfig();
        const coordinator = this.getCoordinator();
        const runningAgents = coordinator ? coordinator.getAgents().filter(a => a.status === 'running').length : 0;
        let canSpawn = true;
        let cannotSpawnReason;
        if (runningAgents >= cfg.maxConcurrentAgents) {
            canSpawn = false;
            cannotSpawnReason = `Max concurrent agents reached (${runningAgents}/${cfg.maxConcurrentAgents})`;
        }
        const load = os.loadavg()[0] ?? 0;
        if (load > cfg.maxLoadAvg) {
            canSpawn = false;
            cannotSpawnReason = `System load ${load.toFixed(2)} exceeds limit ${cfg.maxLoadAvg}`;
        }
        if (totalMem > cfg.maxRssBytes) {
            canSpawn = false;
            cannotSpawnReason = `System memory (rss) ${Math.round(totalMem / 1024 / 1024)}MB exceeds limit ${Math.round(cfg.maxRssBytes / 1024 / 1024)}MB`;
        }
        const systemMemMB = os.totalmem() / 1024 / 1024;
        const freeMemMB = os.freemem() / 1024 / 1024;
        const systemUsagePercent = ((systemMemMB - freeMemMB) / systemMemMB) * 100;
        return {
            memory: {
                rssBytes: totalMem,
                rssMB: Math.round(totalMem / 1024 / 1024),
                heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
                heapUsedMB: Math.round(usedHeap / 1024 / 1024),
                externalMB: Math.round(mem.external / 1024 / 1024),
                systemTotalMB: Math.round(systemMemMB),
                systemFreeMB: Math.round(freeMemMB),
                systemUsagePercent: Math.round(systemUsagePercent),
            },
            loadAvg: {
                '1min': Math.round(load * 100) / 100,
                '5min': Math.round((os.loadavg()[1] ?? 0) * 100) / 100,
                '15min': Math.round((os.loadavg()[2] ?? 0) * 100) / 100,
            },
            cpuCount: os.cpus().length,
            concurrentAgents: runningAgents,
            maxConcurrentAgents: cfg.maxConcurrentAgents,
            canSpawn,
            cannotSpawnReason,
        };
    }
    setBasePath(basePath) {
        this.basePath = basePath;
    }
    setClient(client) {
        this.client = client;
    }
    getActiveSwarmId() {
        return this.activeSwarmId;
    }
    getCoordinator(swarmId) {
        if (swarmId) {
            return this.swarms.get(swarmId)?.coordinator ?? null;
        }
        if (this.activeSwarmId) {
            return this.swarms.get(this.activeSwarmId)?.coordinator ?? null;
        }
        return null;
    }
    async createSwarm(rootSessionId) {
        const swarmId = randomUUID();
        const coordinator = new Coordinator(swarmId, this.basePath, this.client, this);
        await coordinator.initSwarm(rootSessionId);
        this.swarms.set(swarmId, { coordinator, rootSessionId });
        this.activeSwarmId = swarmId;
        return swarmId;
    }
    async initSwarmForTask(taskDescription, rootSessionId) {
        const swarmId = await this.createSwarm(rootSessionId);
        const coordinator = this.getCoordinator(swarmId);
        const plannerTask = await coordinator.createTask(`Plan: ${taskDescription}`);
        const plannerAgent = await coordinator.spawnAgent({
            role: 'planner',
            taskId: plannerTask.id,
            parentSessionId: rootSessionId,
        });
        return { swarmId, plannerAgentId: plannerAgent.id };
    }
    async spawnWorkerAgent(options) {
        const coordinator = this.getCoordinator();
        if (!coordinator) {
            throw new Error('No active swarm');
        }
        // Resource-aware checks at manager level
        const cfg = this.getConfig();
        try {
            const os = await import('os');
            const mem = process.memoryUsage();
            if (mem.rss > cfg.maxRssBytes) {
                throw new Error(`System memory (rss) ${mem.rss} exceeds limit ${cfg.maxRssBytes}`);
            }
            const load = os.loadavg()[0] ?? 0;
            if (load > cfg.maxLoadAvg) {
                throw new Error(`System load ${load.toFixed(2)} exceeds limit ${cfg.maxLoadAvg}`);
            }
        }
        catch (err) {
            // if resource check fails, surface error
            if (err instanceof Error) {
                throw new Error(`Resource check failed: ${err.message}`);
            }
            else {
                throw new Error(`Resource check failed: ${String(err)}`);
            }
        }
        // enforce concurrent agent limit at manager level as well (cross-swarm awareness)
        const runningAgents = coordinator.getAgents().filter(a => a.status === 'running').length;
        if (cfg.maxConcurrentAgents !== undefined && runningAgents >= cfg.maxConcurrentAgents) {
            throw new Error(`Max concurrent agents reached`);
        }
        return coordinator.spawnAgent(options);
    }
    async reportProgress(report) {
        const coordinator = this.getCoordinator();
        if (!coordinator) {
            throw new Error('No active swarm');
        }
        await coordinator.reportProgress(report);
    }
    async completeCurrentAgent(agentId, result) {
        const coordinator = this.getCoordinator();
        if (!coordinator) {
            throw new Error('No active swarm');
        }
        await coordinator.completeAgent(agentId, result);
    }
    async failAgent(agentId, error) {
        const coordinator = this.getCoordinator();
        if (!coordinator) {
            throw new Error('No active swarm');
        }
        await coordinator.failAgent(agentId, error);
    }
    async handleHandoff(handoff) {
        const coordinator = this.getCoordinator();
        if (!coordinator) {
            throw new Error('No active swarm');
        }
        await coordinator.handleHandoff(handoff);
    }
    async broadcast(message, fromAgentId) {
        const coordinator = this.getCoordinator();
        if (!coordinator) {
            throw new Error('No active swarm');
        }
        const agents = coordinator.getAgents();
        for (const agent of agents) {
            if (agent.id !== fromAgentId && agent.status === 'running') {
                coordinator.logEvent(agent.id, 'progress', { broadcast: message, from: fromAgentId });
            }
        }
    }
    async abortSwarm() {
        const coordinator = this.getCoordinator();
        if (!coordinator) {
            throw new Error('No active swarm');
        }
        await coordinator.abortSwarm();
    }
    getSwarmStatus(swarmId) {
        const coordinator = this.getCoordinator(swarmId);
        if (!coordinator) {
            return null;
        }
        return coordinator.getSwarmStatus();
    }
    setActiveSwarm(swarmId) {
        if (this.swarms.has(swarmId)) {
            this.activeSwarmId = swarmId;
        }
    }
    isSwarmComplete() {
        const coordinator = this.getCoordinator();
        if (!coordinator) {
            return false;
        }
        return coordinator.isSwarmComplete();
    }
    hasFailedTasks() {
        const coordinator = this.getCoordinator();
        if (!coordinator) {
            return false;
        }
        return coordinator.hasFailedTasks();
    }
}
export class Coordinator {
    db;
    basePath;
    client;
    spawnedAgents = new Map();
    swarmId;
    managerRef = null;
    // failure/backoff tracking per task
    failureMap = new Map();
    constructor(swarmId, basePath, client, managerRef) {
        this.swarmId = swarmId;
        this.db = new SwarmStateDB(swarmId, basePath);
        this.basePath = basePath;
        this.client = client;
        this.managerRef = managerRef ?? null;
    }
    async initSwarm(rootSessionId) {
        // Prefer existing swarm id in DB, otherwise use the swarmId provided to the Coordinator
        const swarmId = this.db.getSwarm()?.id ?? this.swarmId ?? randomUUID();
        this.db.createSwarm({
            id: swarmId,
            rootSessionId,
            status: 'planning',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        return swarmId;
    }
    async setPlannerSession(plannerSessionId) {
        this.db.updatePlannerSession(plannerSessionId);
    }
    async createTask(description, dependencies = []) {
        const task = {
            id: randomUUID(),
            description,
            dependencies,
            status: 'pending',
            createdAt: Date.now(),
        };
        this.db.createTask(task);
        swarmTelemetry.trackTaskCreate(task.id, description);
        return task;
    }
    async spawnAgent(options) {
        // Resource-aware spawn policy and backoff checks
        const running = this.db.getAgents().filter(a => a.status === 'running').length;
        const cfg = this.managerRef?.getConfig ? this.managerRef.getConfig() : coordinatorManager.getConfig();
        if (cfg.maxConcurrentAgents !== undefined && running >= cfg.maxConcurrentAgents) {
            throw new Error(`Max concurrent agents reached (${cfg.maxConcurrentAgents})`);
        }
        if (options.taskId) {
            const entry = this.failureMap.get(options.taskId);
            const now = Date.now();
            if (entry && entry.nextRetryAt > now) {
                const waitSec = Math.ceil((entry.nextRetryAt - now) / 1000);
                throw new Error(`Backoff active for task ${options.taskId}. Retry in ${waitSec}s`);
            }
        }
        // Validate input options
        const validRoles = ['planner', 'coder', 'reviewer', 'tester', 'documenter', 'worker'];
        if (!options.role || !validRoles.includes(options.role)) {
            throw new Error(`Invalid agent role: ${options.role}. Must be one of: ${validRoles.join(', ')}`);
        }
        if (!options.taskId) {
            throw new Error('taskId is required for agent spawning');
        }
        const agentId = randomUUID();
        const now = Date.now();
        const agent = {
            id: agentId,
            role: options.role,
            status: 'pending',
            progress: 0,
            createdAt: now,
            updatedAt: now,
        };
        this.db.createAgent(agent);
        if (options.taskId) {
            // Ensure the task exists before assigning
            if (!this.db.getTask(options.taskId)) {
                this.db.createTask({
                    id: options.taskId,
                    description: `Task ${options.taskId}`,
                    status: 'pending',
                    dependencies: [],
                    createdAt: Date.now(),
                });
            }
            this.db.assignTaskToAgent(options.taskId, agentId);
            this.db.updateTaskStatus(options.taskId, 'in_progress');
        }
        // Validate taskId to prevent directory traversal
        if (!options.taskId || typeof options.taskId !== 'string' || !/^[a-zA-Z0-9-_]+$/.test(options.taskId)) {
            throw new Error('Invalid taskId: must contain only alphanumeric characters, hyphens, or underscores');
        }
        if (options.taskId.includes('../') || options.taskId.includes('..\\')) {
            throw new Error('Invalid taskId: contains directory traversal sequences');
        }
        const handoffPath = join(this.basePath, `${options.taskId}/handoff.md`);
        let context = options.context ? this.sanitizeText(options.context) : '';
        try {
            const handoffContent = await this.readFile(handoffPath);
            if (options.context) {
                context = `${options.context}\n\n## Prior Handoff Context\n${this.sanitizeText(handoffContent)}`;
            }
            else {
                context = this.sanitizeText(handoffContent);
            }
        }
        catch {
            // No handoff file yet
        }
        const systemPrompt = buildAgentSystemPrompt(options.role, `Task: ${options.taskId}`, context);
        const roleDef = getRoleDefinition(options.role);
        const tools = roleDef.tools.map(tool => ({ name: tool }));
        const childSessionId = await this.createChildSession({
            parentSessionId: options.parentSessionId,
            title: `[swarm] ${options.role}: ${options.taskId.substring(0, 30)}`,
            systemPrompt,
            tools,
        });
        this.spawnedAgents.set(agentId, childSessionId);
        this.db.updateAgentStatus(agentId, 'running');
        swarmTelemetry.trackAgentSpawn(agentId, options.role);
        if (options.taskId) {
            swarmTelemetry.trackTaskStart(options.taskId, agentId);
        }
        return agent;
    }
    async reportProgress(report) {
        const agent = this.db.getAgent(report.agentId);
        if (!agent)
            return;
        this.db.updateAgentStatus(report.agentId, agent.status, report.progress);
        this.db.logEvent(report.agentId, 'progress', {
            progress: report.progress,
            message: report.message,
        });
        const tasks = this.db.getTasksByAgent(report.agentId);
        for (const task of tasks) {
            if (report.progress >= 1) {
                this.db.updateTaskStatus(task.id, 'completed', Date.now());
            }
        }
    }
    async completeAgent(agentId, result) {
        this.db.updateAgentStatus(agentId, 'completed', 1, result);
        this.db.logEvent(agentId, 'complete', { result });
        const tasks = this.db.getTasksByAgent(agentId);
        for (const task of tasks) {
            if (task.status !== 'completed') {
                this.db.updateTaskStatus(task.id, 'completed', Date.now());
                swarmTelemetry.trackTaskComplete(task.id, 'completed');
            }
        }
        swarmTelemetry.trackAgentComplete(agentId, 'completed');
    }
    async failAgent(agentId, error) {
        this.db.updateAgentStatus(agentId, 'failed', undefined, undefined, error);
        this.db.logEvent(agentId, 'fail', { error });
        const tasks = this.db.getTasksByAgent(agentId);
        const now = Date.now();
        for (const task of tasks) {
            if (task.status !== 'completed') {
                this.db.updateTaskStatus(task.id, 'failed');
                swarmTelemetry.trackTaskComplete(task.id, 'failed');
            }
            // record failure/backoff for the task
            const entry = this.failureMap.get(task.id) ?? { failures: 0, nextRetryAt: 0 };
            entry.failures += 1;
            swarmTelemetry.trackAgentRetry(agentId);
            const base = coordinatorManager.getConfig().backoffBaseSeconds ?? 5;
            const delay = base * Math.pow(2, Math.max(0, entry.failures - 1)) * 1000;
            entry.nextRetryAt = now + delay;
            this.failureMap.set(task.id, entry);
        }
    }
    async handleHandoff(handoff) {
        // Validate inputs to prevent security issues
        if (!handoff.taskId || typeof handoff.taskId !== 'string' || !/^[a-zA-Z0-9-_]+$/.test(handoff.taskId)) {
            throw new Error('Invalid taskId: must contain only alphanumeric characters, hyphens, or underscores');
        }
        if (!handoff.fromAgentId || typeof handoff.fromAgentId !== 'string' || !/^[a-zA-Z0-9-_]+$/.test(handoff.fromAgentId)) {
            throw new Error('Invalid fromAgentId: must contain only alphanumeric characters, hyphens, or underscores');
        }
        // Prevent directory traversal in taskId
        if (handoff.taskId.includes('../') || handoff.taskId.includes('..\\')) {
            throw new Error('Invalid taskId: contains directory traversal sequences');
        }
        const handoffDir = join(this.basePath, handoff.taskId);
        const handoffFile = join(handoffDir, 'handoff.md');
        // Additional check to ensure the constructed path is within the allowed base path
        const resolvedBasePath = join(process.cwd(), this.basePath);
        const resolvedHandoffPath = join(process.cwd(), handoffFile);
        if (!resolvedHandoffPath.startsWith(resolvedBasePath)) {
            throw new Error('Invalid path: handoff file path resolves outside base directory');
        }
        let existing = '';
        try {
            existing = await this.readFile(handoffFile);
        }
        catch {
            // File doesn't exist yet
        }
        const entry = `## Handoff from ${handoff.fromAgentId}\nTimestamp: ${new Date().toISOString()}\n\n### Context\n${this.sanitizeText(handoff.context)}\n\n### Files Modified\n${handoff.files.length > 0 ? handoff.files.map(f => `- ${this.sanitizeText(f)}`).join('\n') : '- (none)'}\n\n### Decisions Made\n${handoff.decisions.length > 0 ? handoff.decisions.map(d => `- ${this.sanitizeText(d)}`).join('\n') : '- (none)'}\n`;
        const newContent = existing ? `${existing}\n---\n${entry}` : entry;
        await this.writeFile(handoffFile, newContent);
        this.db.logEvent(handoff.fromAgentId, 'handoff', {
            taskId: handoff.taskId,
            files: handoff.files,
            decisions: handoff.decisions,
        });
    }
    async abortSwarm() {
        this.db.updateSwarmStatus('aborted');
        const agents = this.db.getAgents();
        for (const agent of agents) {
            if (agent.status === 'running') {
                const sessionId = this.spawnedAgents.get(agent.id);
                if (sessionId) {
                    await this.abortSession(sessionId);
                }
                this.db.updateAgentStatus(agent.id, 'failed', undefined, undefined, 'Swarm aborted');
            }
        }
        const tasks = this.db.getTasks();
        for (const task of tasks) {
            if (task.status === 'pending' || task.status === 'in_progress') {
                this.db.updateTaskStatus(task.id, 'failed');
            }
        }
    }
    getSwarmStatus() {
        return {
            swarm: this.db.getSwarm() ?? null,
            agents: this.db.getAgents(),
            tasks: this.db.getTasks(),
        };
    }
    getAgents() {
        return this.db.getAgents();
    }
    getAgentSessionId(agentId) {
        return this.spawnedAgents.get(agentId);
    }
    getDb() {
        return this.db;
    }
    isSwarmComplete() {
        const agents = this.db.getAgents();
        // Swarm is complete only when all agents have completed successfully
        return agents.length > 0 && agents.every(a => a.status === 'completed');
    }
    hasFailedTasks() {
        const tasks = this.db.getTasks();
        return tasks.some(t => t.status === 'failed');
    }
    logEvent(agentId, type, data) {
        this.db.logEvent(agentId, type, data);
    }
    async createChildSession(options) {
        if (!this.client) {
            console.warn('No client available, returning random UUID for session');
            return randomUUID();
        }
        try {
            // SDK Session.create expects body: { parentID?, title? }
            // Response is RequestResult with data: Session
            const response = await this.client.session.create({
                body: {
                    parentID: options.parentSessionId,
                    title: options.title,
                },
            });
            // Response.data contains the Session object with id property
            if (!response.data) {
                throw new Error('Session creation returned no data');
            }
            return response.data.id;
        }
        catch (error) {
            console.error(`Failed to create child session: ${error instanceof Error ? error.message : String(error)}`);
            // Return a random UUID as fallback to allow the agent to continue operating
            return randomUUID();
        }
    }
    async abortSession(sessionId) {
        if (!this.client)
            return;
        try {
            await this.client.session.abort({
                path: { id: sessionId }
            });
        }
        catch (error) {
            console.warn(`Failed to abort session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
            // Session may already be terminated, which is acceptable
        }
    }
    async readFile(path) {
        try {
            const fs = await import('fs/promises');
            return await fs.readFile(path, 'utf-8');
        }
        catch (error) {
            throw new Error(`Failed to read file ${path}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async writeFile(path, content) {
        try {
            const fs = await import('fs/promises');
            const dir = dirname(path);
            // Ensure directory exists with restrictive permissions
            await fs.mkdir(dir, { recursive: true, mode: 0o700 });
            // Write file with owner-read/write only permissions
            await fs.writeFile(path, content, { encoding: 'utf-8', mode: 0o600 });
        }
        catch (error) {
            throw new Error(`Failed to write file ${path}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    sanitizeText(text) {
        // Basic sanitization to prevent injection attacks
        if (typeof text !== 'string') {
            return '';
        }
        // Remove control characters except common whitespace
        return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }
    close() {
        this.db.close();
    }
}
export const coordinatorManager = new CoordinatorManager();

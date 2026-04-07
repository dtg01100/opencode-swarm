import type { OpencodeClient } from '@opencode-ai/sdk/client';
import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { SwarmStateDB } from './state.js';
import { buildAgentSystemPrompt, getRoleDefinition } from './roles.js';
import { swarmTelemetry } from './telemetry.js';
import type { Agent, Task, AgentRole, SpawnOptions, SubswarmOptions, ProgressReport, HandoffData, SwarmState } from '../types.js';

export class CoordinatorManager {
  private basePath: string = '.opencode/swarm';
  private client: OpencodeClient | null = null;
  private swarms: Map<string, { coordinator: Coordinator; rootSessionId: string }> = new Map();
  private activeSwarmId: string | null = null;

  // Subswarm registry: parentSwarmId -> Set of childSwarmIds
  private subswarmChildren: Map<string, Set<string>> = new Map();
  // Subswarm timeouts: childSwarmId -> timeoutMs
  private subswarmTimeouts: Map<string, number> = new Map();

  // Global orchestration: task queue and metadata
  private globalTaskQueue: Map<string, { task: Task; status: Task['status'] | 'assigned' | 'queued' | 'failed'; assignedSwarmId?: string; assignedTaskId?: string }> = new Map();

  // Orchestrator integration (optional)
  private orchestrator: any = null;

  setOrchestrator(orch: any): void {
    this.orchestrator = orch;
  }

  startOrchestrator(): void {
    if (!this.orchestrator) throw new Error('No orchestrator set');
    if (typeof this.orchestrator.start === 'function') this.orchestrator.start();
  }

  stopOrchestrator(): void {
    if (!this.orchestrator) throw new Error('No orchestrator set');
    if (typeof this.orchestrator.stop === 'function') this.orchestrator.stop();
  }

  submitGlobalTask(description: string, priority = 0, dependencies: string[] = [], rootSessionId?: string) {
    if (!this.orchestrator) throw new Error('No orchestrator set');
    if (typeof this.orchestrator.submitGlobalTask === 'function') {
      try {
        return this.orchestrator.submitGlobalTask(description, priority, dependencies, rootSessionId);
      } catch (error) {
        throw new Error(`Failed to submit global task: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw new Error('Orchestrator does not implement submitGlobalTask');
  }

  // autoscaling / spawn config
  private config: {
    maxConcurrentAgents: number;
    maxRssBytes: number;
    maxLoadAvg: number;
    backoffBaseSeconds: number;
  } = {
    maxConcurrentAgents: Number(process.env.OPENCODE_SWARM_MAX_CONCURRENT_AGENTS ?? 5),
    maxRssBytes: Number(process.env.OPENCODE_SWARM_MAX_RSS_BYTES ?? 1_500_000_000),
    maxLoadAvg: Number(process.env.OPENCODE_SWARM_MAX_LOAD_AVG ?? 4),
    backoffBaseSeconds: Number(process.env.OPENCODE_SWARM_BACKOFF_BASE_SECONDS ?? 5),
  };

  setConfig(cfg: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...cfg };
  }

  getConfig(): typeof this.config {
    return this.config;
  }

  async getResourceStatus(): Promise<{
    memory: {
      rssBytes: number;
      rssMB: number;
      heapTotalMB: number;
      heapUsedMB: number;
      externalMB: number;
      systemTotalMB: number;
      systemFreeMB: number;
      systemUsagePercent: number;
    };
    loadAvg: {
      '1min': number;
      '5min': number;
      '15min': number;
    };
    cpuCount: number;
    concurrentAgents: number;
    maxConcurrentAgents: number;
    canSpawn: boolean;
    cannotSpawnReason?: string;
  }> {
    const mem = process.memoryUsage();
    const totalMem = mem.rss;
    const usedHeap = mem.heapUsed;
    const os = await import('os');

    const cfg = this.getConfig();
    const coordinator = this.getCoordinator();
    const runningAgents = coordinator ? coordinator.getAgents().filter(a => a.status === 'running').length : 0;

    let canSpawn = true;
    let cannotSpawnReason: string | undefined;

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

  setBasePath(basePath: string): void {
    this.basePath = basePath;
  }

  setClient(client: OpencodeClient): void {
    this.client = client;
  }

  getActiveSwarmId(): string | null {
    return this.activeSwarmId;
  }

  getCoordinator(swarmId?: string): Coordinator | null {
    if (swarmId) {
      return this.swarms.get(swarmId)?.coordinator ?? null;
    }
    if (this.activeSwarmId) {
      return this.swarms.get(this.activeSwarmId)?.coordinator ?? null;
    }
    return null;
  }

  async createSwarm(rootSessionId: string): Promise<string> {
    const swarmId = randomUUID();
    const coordinator = new Coordinator(swarmId, this.basePath, this.client, this);
    await coordinator.initSwarm(rootSessionId);
    this.swarms.set(swarmId, { coordinator, rootSessionId });
    this.activeSwarmId = swarmId;
    return swarmId;
  }

  async initSwarmForTask(taskDescription: string, rootSessionId: string): Promise<{ swarmId: string; plannerAgentId: string }> {
    const swarmId = await this.createSwarm(rootSessionId);
    const coordinator = this.getCoordinator(swarmId)!;
    
    const plannerTask = await coordinator.createTask(`Plan: ${taskDescription}`);
    const plannerAgent = await coordinator.spawnAgent({
      role: 'planner',
      taskId: plannerTask.id,
      parentSessionId: rootSessionId,
    });

    return { swarmId, plannerAgentId: plannerAgent.id };
  }

  async spawnSubswarm(options: SubswarmOptions): Promise<{ swarmId: string; plannerAgentId: string }> {
    const childSwarmId = randomUUID();
    const coordinator = new Coordinator(childSwarmId, this.basePath, this.client, this);
    coordinator.setParentHandoffPath(options.parentHandoffPath);
    await coordinator.initSwarm(options.parentSessionId);
    this.swarms.set(childSwarmId, { coordinator, rootSessionId: options.parentSessionId });
    this.activeSwarmId = childSwarmId;

    // Register child in subswarm registry
    if (!this.subswarmChildren.has(options.parentSwarmId)) {
      this.subswarmChildren.set(options.parentSwarmId, new Set());
    }
    this.subswarmChildren.get(options.parentSwarmId)!.add(childSwarmId);

    // Set timeout if provided
    if (options.timeoutMs) {
      this.subswarmTimeouts.set(childSwarmId, Date.now() + options.timeoutMs);
    }

    const plannerTask = await coordinator.createTask(`Plan: ${options.taskDescription}`);
    const context = `This is a subswarm spawned by parent swarm ${options.parentSwarmId}.\nParent handoff path: ${options.parentHandoffPath}`;
    const plannerAgent = await coordinator.spawnAgent({
      role: 'planner',
      taskId: plannerTask.id,
      parentSessionId: options.parentSessionId,
      context,
    });

    return { swarmId: childSwarmId, plannerAgentId: plannerAgent.id };
  }

  async spawnSubswarmAsync(options: SubswarmOptions): Promise<string> {
    const childSwarmId = randomUUID();
    this.swarms.set(childSwarmId, {
      coordinator: new Coordinator(childSwarmId, this.basePath, this.client, this),
      rootSessionId: options.parentSessionId,
    });

    // Register child in subswarm registry
    if (!this.subswarmChildren.has(options.parentSwarmId)) {
      this.subswarmChildren.set(options.parentSwarmId, new Set());
    }
    this.subswarmChildren.get(options.parentSwarmId)!.add(childSwarmId);

    // Set timeout if provided
    if (options.timeoutMs) {
      this.subswarmTimeouts.set(childSwarmId, Date.now() + options.timeoutMs);
    }

    setImmediate(async () => {
      try {
        const coordinator = this.getCoordinator(childSwarmId)!;
        coordinator.setParentHandoffPath(options.parentHandoffPath);
        await coordinator.initSwarm(options.parentSessionId);
        
        const plannerTask = await coordinator.createTask(`Plan: ${options.taskDescription}`);
        const context = `This is a subswarm spawned by parent swarm ${options.parentSwarmId}.\nParent handoff path: ${options.parentHandoffPath}`;
        await coordinator.spawnAgent({
          role: 'planner',
          taskId: plannerTask.id,
          parentSessionId: options.parentSessionId,
          context,
        });
      } catch (error) {
        console.error(`Failed to spawn subswarm ${childSwarmId}: ${error}`);
      }
    });

    return childSwarmId;
  }

  async spawnWorkerAgent(options: SpawnOptions): Promise<Agent> {
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
    } catch (err) {
      // if resource check fails, surface error
      if (err instanceof Error) {
        throw new Error(`Resource check failed: ${err.message}`);
      } else {
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

  async reportProgress(report: ProgressReport): Promise<void> {
    const coordinator = this.getCoordinator();
    if (!coordinator) {
      throw new Error('No active swarm');
    }
    await coordinator.reportProgress(report);
  }

  async completeCurrentAgent(agentId: string, result: string): Promise<void> {
    const coordinator = this.getCoordinator();
    if (!coordinator) {
      throw new Error('No active swarm');
    }
    await coordinator.completeAgent(agentId, result);
  }

  async failAgent(agentId: string, error: string): Promise<void> {
    const coordinator = this.getCoordinator();
    if (!coordinator) {
      throw new Error('No active swarm');
    }
    await coordinator.failAgent(agentId, error);
  }

  async handleHandoff(handoff: HandoffData): Promise<void> {
    const coordinator = this.getCoordinator();
    if (!coordinator) {
      throw new Error('No active swarm');
    }
    await coordinator.handleHandoff(handoff);
  }

  async broadcast(message: string, fromAgentId?: string): Promise<void> {
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

  async abortSwarm(): Promise<void> {
    const coordinator = this.getCoordinator();
    if (!coordinator) {
      throw new Error('No active swarm');
    }
    await coordinator.abortSwarm();
  }

  async abortSubswarm(swarmId: string): Promise<void> {
    const coordinator = this.getCoordinator(swarmId);
    if (!coordinator) {
      throw new Error(`Subswarm ${swarmId} not found`);
    }
    await coordinator.abortSwarm();
  }

  getSwarmStatus(swarmId?: string): { swarm: SwarmState | null; agents: Agent[]; tasks: Task[] } | null {
    const coordinator = this.getCoordinator(swarmId);
    if (!coordinator) {
      return null;
    }
    return coordinator.getSwarmStatus();
  }

  async pollSubswarm(childSwarmId: string): Promise<{
    status: 'running' | 'completed' | 'failed' | 'not_found' | 'timed_out';
    propagatedResults: string | null;
    childHandoff: string | null;
    agentsCompleted: number;
    agentsFailed: number;
    tasksCompleted: number;
    tasksFailed: number;
    timedOut: boolean;
  }> {
    const status = this.getSwarmStatus(childSwarmId);
    if (!status) {
      return {
        status: 'not_found',
        propagatedResults: null,
        childHandoff: null,
        agentsCompleted: 0,
        agentsFailed: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        timedOut: false,
      };
    }

    // Check for timeout
    const timedOut = this.subswarmTimeouts.has(childSwarmId) && 
      Date.now() > this.subswarmTimeouts.get(childSwarmId)!;

    const agentsCompleted = status.agents.filter(a => a.status === 'completed').length;
    const agentsFailed = status.agents.filter(a => a.status === 'failed').length;
    const tasksCompleted = status.tasks.filter(t => t.status === 'completed').length;
    const tasksFailed = status.tasks.filter(t => t.status === 'failed').length;

    const isComplete = status.agents.length > 0 && status.agents.every(a => a.status === 'completed' || a.status === 'failed');
    const hasFailed = status.tasks.some(t => t.status === 'failed');

    let propagatedResults: string | null = null;
    let childHandoff: string | null = null;
    let finalStatus: 'running' | 'completed' | 'failed' | 'timed_out' = 'running';

    if (timedOut && !isComplete) {
      finalStatus = 'timed_out';
    } else if (isComplete) {
      finalStatus = hasFailed ? 'failed' : 'completed';
    }

    // Read child's own handoff file directly
    const coordinator = this.getCoordinator(childSwarmId)!;
    try {
      childHandoff = await coordinator.readFile(coordinator.getHandoffPath());
    } catch {}

    // Read propagated results from parent's handoff (if complete)
    if (isComplete) {
      const parentPath = coordinator.getParentHandoffPath();
      if (parentPath) {
        try {
          propagatedResults = await coordinator.readFile(parentPath);
        } catch {}
      }
    }

    return {
      status: finalStatus,
      propagatedResults,
      childHandoff,
      agentsCompleted,
      agentsFailed,
      tasksCompleted,
      tasksFailed,
      timedOut,
    };
  }

  abandonSubswarm(childSwarmId: string): { success: boolean; message: string } {
    if (!this.swarms.has(childSwarmId)) {
      return { success: false, message: 'Subswarm not found' };
    }

    // Remove from timeouts
    this.subswarmTimeouts.delete(childSwarmId);

    // Remove from parent's children registry
    for (const [parentId, children] of this.subswarmChildren.entries()) {
      if (children.has(childSwarmId)) {
        children.delete(childSwarmId);
        if (children.size === 0) {
          this.subswarmChildren.delete(parentId);
        }
        break;
      }
    }

    return { success: true, message: `Subswarm ${childSwarmId.substring(0, 8)} disowned` };
  }

  getSubswarmChildren(parentSwarmId: string): string[] {
    const children = this.subswarmChildren.get(parentSwarmId);
    return children ? Array.from(children) : [];
  }

  getSwarmTodoTree(swarmId: string, maxDepth = 10, currentDepth = 0): {
    swarmId: string;
    status: string;
    agents: { id: string; role: string; status: string; progress: number }[];
    tasks: { id: string; description: string; status: string; progress: number }[];
    children: ReturnType<CoordinatorManager['getSwarmTodoTree']>[];
  } | null {
    if (currentDepth > maxDepth) {
      return null;
    }

    const status = this.getSwarmStatus(swarmId);
    if (!status) {
      return null;
    }

    const children = this.getSubswarmChildren(swarmId).map(childId => 
      this.getSwarmTodoTree(childId, maxDepth, currentDepth + 1)
    ).filter((c): c is NonNullable<ReturnType<CoordinatorManager['getSwarmTodoTree']>> => c !== null);

    return {
      swarmId,
      status: status.swarm?.status ?? 'unknown',
      agents: status.agents.map(a => ({
        id: a.id,
        role: a.role,
        status: a.status,
        progress: a.progress,
      })),
      tasks: status.tasks.map(t => ({
        id: t.id,
        description: t.description,
        status: t.status,
        progress: t.status === 'completed' ? 1 : t.status === 'in_progress' ? 0.5 : 0,
      })),
      children,
    };
  }

  setActiveSwarm(swarmId: string): void {
    if (this.swarms.has(swarmId)) {
      this.activeSwarmId = swarmId;
    }
  }

  isSwarmComplete(): boolean {
    const coordinator = this.getCoordinator();
    if (!coordinator) {
      return false;
    }
    return coordinator.isSwarmComplete();
  }

  hasFailedTasks(): boolean {
    const coordinator = this.getCoordinator();
    if (!coordinator) {
      return false;
    }
    return coordinator.hasFailedTasks();
  }

  async getParentContext(query?: string): Promise<{ context: string | null; query: string | null }> {
    const coordinator = this.getCoordinator();
    if (!coordinator) {
      return { context: null, query: query ?? null };
    }
    return coordinator.getParentContext(query);
  }
}

export class Coordinator {
  private db: SwarmStateDB;
  private basePath: string;
  private client: OpencodeClient | null;
  private spawnedAgents: Map<string, string> = new Map();
  private swarmId: string;
  private managerRef: CoordinatorManager | null = null;
  private parentHandoffPath: string | null = null;
  // failure/backoff tracking per task
  private failureMap: Map<string, { failures: number; nextRetryAt: number }> = new Map();

  constructor(swarmId: string, basePath: string, client: OpencodeClient | null, managerRef?: CoordinatorManager) {
    this.swarmId = swarmId;
    this.db = new SwarmStateDB(swarmId, basePath);
    this.basePath = basePath;
    this.client = client;
    this.managerRef = managerRef ?? null;
  }

  setParentHandoffPath(path: string): void {
    this.parentHandoffPath = path;
  }

  getParentHandoffPath(): string | null {
    return this.parentHandoffPath;
  }

  async getParentContext(query?: string): Promise<{ context: string | null; query: string | null }> {
    const parentPath = this.getParentHandoffPath();
    if (!parentPath) return { context: null, query: query ?? null };
    try {
      const fullContext = await this.readFile(parentPath);
      if (!query) return { context: fullContext, query: null };
      const lines = fullContext.split('\n');
      const matchingLines = lines.filter(line => line.toLowerCase().includes(query.toLowerCase()));
      return {
        context: matchingLines.length > 0 ? matchingLines.join('\n') : null,
        query,
      };
    } catch {
      return { context: null, query: query ?? null };
    }
  }

  async initSwarm(rootSessionId: string): Promise<string> {
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

  async setPlannerSession(plannerSessionId: string): Promise<void> {
    this.db.updatePlannerSession(plannerSessionId);
  }

  async createTask(description: string, dependencies: string[] = []): Promise<Task> {
    const task: Task = {
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

  async spawnAgent(options: SpawnOptions): Promise<Agent> {
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

    const agent: Agent = {
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
      } else {
        context = this.sanitizeText(handoffContent);
      }
    } catch {
      // No handoff file yet
    }

    const systemPrompt = buildAgentSystemPrompt(
      options.role,
      `Task: ${options.taskId}`,
      context
    );

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

  async reportProgress(report: ProgressReport): Promise<void> {
    const agent = this.db.getAgent(report.agentId);
    if (!agent) return;

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

  async completeAgent(agentId: string, result: string): Promise<void> {
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

    if (this.isSwarmComplete()) {
      await this.notifyParentCompletion();
    }
  }

  private async notifyParentCompletion(): Promise<void> {
    const parentPath = this.getParentHandoffPath();
    if (!parentPath) return;

    const status = this.getSwarmStatus();
    const completionMsg = `## Subswarm ${this.swarmId} Completed\nAgents: ${status.agents.length}, Completed: ${status.agents.filter(a => a.status === 'completed').length}, Failed: ${status.agents.filter(a => a.status === 'failed').length}`;

    try {
      const existing = await this.readFile(parentPath).catch(() => '');
      await this.writeFile(parentPath, existing ? `${existing}\n---\n${completionMsg}` : completionMsg);
    } catch (error) {
      console.error(`Failed to notify parent completion: ${error}`);
    }
  }

  async failAgent(agentId: string, error: string): Promise<void> {
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

    if (this.isSwarmComplete()) {
      await this.notifyParentCompletion();
    }
  }

  async handleHandoff(handoff: HandoffData): Promise<void> {
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

    // Use swarm-level handoff path: {basePath}/{swarmId}/handoff.md
    const handoffDir = join(this.basePath, this.swarmId);
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
    } catch {
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

  async abortSwarm(): Promise<void> {
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

  getSwarmStatus(): { swarm: SwarmState | null; agents: Agent[]; tasks: Task[] } {
    return {
      swarm: this.db.getSwarm() ?? null,
      agents: this.db.getAgents(),
      tasks: this.db.getTasks(),
    };
  }

  getAgents(): Agent[] {
    return this.db.getAgents();
  }

  getAgentSessionId(agentId: string): string | undefined {
    return this.spawnedAgents.get(agentId);
  }

  getDb(): SwarmStateDB {
    return this.db;
  }

  getSwarmId(): string {
    return this.swarmId;
  }

  getHandoffPath(): string {
    return join(this.basePath, this.swarmId, 'handoff.md');
  }

  getSwarmHandoffDir(): string {
    return join(this.basePath, this.swarmId);
  }

  async readSwarmHandoff(swarmId: string): Promise<string> {
    const handoffPath = join(this.basePath, swarmId, 'handoff.md');
    try {
      return await this.readFile(handoffPath);
    } catch {
      return '';
    }
  }

  async appendToParentHandoff(parentHandoffPath: string): Promise<void> {
    const myHandoff = await this.readFile(this.getHandoffPath());
    if (!myHandoff) return;

    const parentDir = dirname(parentHandoffPath);
    const fs = await import('fs/promises');
    try {
      await fs.mkdir(parentDir, { recursive: true, mode: 0o700 });
    } catch {}

    let existingParentHandoff = '';
    try {
      existingParentHandoff = await this.readFile(parentHandoffPath);
    } catch {}

    const propagatedEntry = `## Propagation from subswarm ${this.swarmId}\nTimestamp: ${new Date().toISOString()}\n\n### Child Swarm Handoff\n${myHandoff}\n`;
    const newContent = existingParentHandoff 
      ? `${existingParentHandoff}\n---\n${propagatedEntry}`
      : propagatedEntry;

    await this.writeFile(parentHandoffPath, newContent);
  }

  async propagateToParent(): Promise<void> {
    const parentPath = this.getParentHandoffPath();
    if (!parentPath) {
      throw new Error('No parent handoff path set - not a subswarm');
    }
    await this.appendToParentHandoff(parentPath);
  }

  isSwarmComplete(): boolean {
    const agents = this.db.getAgents();
    // Swarm is complete only when all agents have completed successfully
    return agents.length > 0 && agents.every(a => a.status === 'completed');
  }

  hasFailedTasks(): boolean {
    const tasks = this.db.getTasks();
    return tasks.some(t => t.status === 'failed');
  }

  logEvent(agentId: string, type: 'progress' | 'complete' | 'fail' | 'handoff', data: Record<string, unknown>): void {
    this.db.logEvent(agentId, type, data);
  }

  private async createChildSession(options: {
    parentSessionId?: string;
    title: string;
    systemPrompt: string;
    tools: { name: string }[];
  }): Promise<string> {
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
    } catch (error) {
      console.error(`Failed to create child session: ${error instanceof Error ? error.message : String(error)}`);
      // Return a random UUID as fallback to allow the agent to continue operating
      return randomUUID();
    }
  }

  private async abortSession(sessionId: string): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.session.abort({
        path: { id: sessionId }
      });
    } catch (error) {
      console.warn(`Failed to abort session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      // Session may already be terminated, which is acceptable
    }
  }

  async readFile(path: string): Promise<string> {
    try {
      const fs = await import('fs/promises');
      return await fs.readFile(path, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async writeFile(path: string, content: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const dir = dirname(path);
      // Ensure directory exists with restrictive permissions
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      // Write file with owner-read/write only permissions
      await fs.writeFile(path, content, { encoding: 'utf-8', mode: 0o600 });
    } catch (error) {
      throw new Error(`Failed to write file ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private sanitizeText(text: string): string {
    // Basic sanitization to prevent injection attacks
    if (typeof text !== 'string') {
      return '';
    }
    // Remove control characters except common whitespace
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  close(): void {
    this.db.close();
  }
}

export const coordinatorManager = new CoordinatorManager();
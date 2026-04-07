export interface AgentMetrics {
  agentId: string;
  role: string;
  spawnedAt: number;
  completedAt?: number;
  durationMs?: number;
  status: 'completed' | 'failed' | 'running';
  retries: number;
}

export interface TaskMetrics {
  taskId: string;
  description: string;
  createdAt: number;
  completedAt?: number;
  durationMs?: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  agentId?: string;
}

export interface SwarmMetrics {
  swarmId: string;
  startedAt: number;
  endedAt?: number;
  totalDurationMs?: number;
  agentsSpawned: number;
  agentsCompleted: number;
  agentsFailed: number;
  tasksCreated: number;
  tasksCompleted: number;
  tasksFailed: number;
}

export class SwarmTelemetry {
  private agentMetrics: Map<string, AgentMetrics> = new Map();
  private taskMetrics: Map<string, TaskMetrics> = new Map();
  private swarmMetrics: Map<string, SwarmMetrics> = new Map();
  private currentSwarmId: string | null = null;

  setCurrentSwarm(swarmId: string): void {
    this.currentSwarmId = swarmId;
    if (!this.swarmMetrics.has(swarmId)) {
      this.swarmMetrics.set(swarmId, {
        swarmId,
        startedAt: Date.now(),
        agentsSpawned: 0,
        agentsCompleted: 0,
        agentsFailed: 0,
        tasksCreated: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
      });
    }
  }

  trackAgentSpawn(agentId: string, role: string): void {
    const metric: AgentMetrics = {
      agentId,
      role,
      spawnedAt: Date.now(),
      status: 'running',
      retries: 0,
    };
    this.agentMetrics.set(agentId, metric);

    if (this.currentSwarmId) {
      const swarm = this.swarmMetrics.get(this.currentSwarmId);
      if (swarm) {
        swarm.agentsSpawned++;
      }
    }
  }

  trackAgentRetry(agentId: string): void {
    const metric = this.agentMetrics.get(agentId);
    if (metric) {
      metric.retries++;
    }
  }

  trackAgentComplete(agentId: string, status: 'completed' | 'failed'): void {
    const metric = this.agentMetrics.get(agentId);
    if (metric) {
      metric.completedAt = Date.now();
      metric.durationMs = metric.completedAt - metric.spawnedAt;
      metric.status = status;
    }

    if (this.currentSwarmId) {
      const swarm = this.swarmMetrics.get(this.currentSwarmId);
      if (swarm) {
        if (status === 'completed') {
          swarm.agentsCompleted++;
        } else {
          swarm.agentsFailed++;
        }
      }
    }
  }

  trackTaskCreate(taskId: string, description: string): void {
    const metric: TaskMetrics = {
      taskId,
      description,
      createdAt: Date.now(),
      status: 'pending',
    };
    this.taskMetrics.set(taskId, metric);

    if (this.currentSwarmId) {
      const swarm = this.swarmMetrics.get(this.currentSwarmId);
      if (swarm) {
        swarm.tasksCreated++;
      }
    }
  }

  trackTaskStart(taskId: string, agentId: string): void {
    const metric = this.taskMetrics.get(taskId);
    if (metric) {
      metric.status = 'in_progress';
      metric.agentId = agentId;
    }
  }

  trackTaskComplete(taskId: string, status: 'completed' | 'failed'): void {
    const metric = this.taskMetrics.get(taskId);
    if (metric) {
      metric.completedAt = Date.now();
      metric.durationMs = metric.completedAt - metric.createdAt;
      metric.status = status;
    }

    if (this.currentSwarmId) {
      const swarm = this.swarmMetrics.get(this.currentSwarmId);
      if (swarm) {
        if (status === 'completed') {
          swarm.tasksCompleted++;
        } else {
          swarm.tasksFailed++;
        }
      }
    }
  }

  endSwarm(swarmId: string): void {
    const swarm = this.swarmMetrics.get(swarmId);
    if (swarm) {
      swarm.endedAt = Date.now();
      swarm.totalDurationMs = swarm.endedAt - swarm.startedAt;
    }
    if (this.currentSwarmId === swarmId) {
      this.currentSwarmId = null;
    }
  }

  getSwarmMetrics(swarmId: string): SwarmMetrics | undefined {
    return this.swarmMetrics.get(swarmId);
  }

  getAgentMetrics(agentId: string): AgentMetrics | undefined {
    return this.agentMetrics.get(agentId);
  }

  getTaskMetrics(taskId: string): TaskMetrics | undefined {
    return this.taskMetrics.get(taskId);
  }

  getSwarmSummary(swarmId: string): {
    swarmMetrics: SwarmMetrics | undefined;
    avgAgentDurationMs: number;
    avgTaskDurationMs: number;
    successRate: number;
  } {
    const swarmMetrics = this.swarmMetrics.get(swarmId);
    if (!swarmMetrics) {
      return {
        swarmMetrics: undefined,
        avgAgentDurationMs: 0,
        avgTaskDurationMs: 0,
        successRate: 0,
      };
    }

    const agentDurations = Array.from(this.agentMetrics.values())
      .filter(m => m.durationMs !== undefined)
      .map(m => m.durationMs!);
    const avgAgentDurationMs = agentDurations.length > 0
      ? agentDurations.reduce((a, b) => a + b, 0) / agentDurations.length
      : 0;

    const taskDurations = Array.from(this.taskMetrics.values())
      .filter(m => m.durationMs !== undefined)
      .map(m => m.durationMs!);
    const avgTaskDurationMs = taskDurations.length > 0
      ? taskDurations.reduce((a, b) => a + b, 0) / taskDurations.length
      : 0;

    const totalAgents = swarmMetrics.agentsCompleted + swarmMetrics.agentsFailed;
    const successRate = totalAgents > 0 ? swarmMetrics.agentsCompleted / totalAgents : 0;

    return {
      swarmMetrics,
      avgAgentDurationMs,
      avgTaskDurationMs,
      successRate,
    };
  }

  clear(): void {
    this.agentMetrics.clear();
    this.taskMetrics.clear();
    this.swarmMetrics.clear();
    this.currentSwarmId = null;
  }
}

export const swarmTelemetry = new SwarmTelemetry();

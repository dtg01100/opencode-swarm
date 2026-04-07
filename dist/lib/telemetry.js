export class SwarmTelemetry {
    agentMetrics = new Map();
    taskMetrics = new Map();
    swarmMetrics = new Map();
    currentSwarmId = null;
    setCurrentSwarm(swarmId) {
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
    trackAgentSpawn(agentId, role) {
        const metric = {
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
    trackAgentRetry(agentId) {
        const metric = this.agentMetrics.get(agentId);
        if (metric) {
            metric.retries++;
        }
    }
    trackAgentComplete(agentId, status) {
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
                }
                else {
                    swarm.agentsFailed++;
                }
            }
        }
    }
    trackTaskCreate(taskId, description) {
        const metric = {
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
    trackTaskStart(taskId, agentId) {
        const metric = this.taskMetrics.get(taskId);
        if (metric) {
            metric.status = 'in_progress';
            metric.agentId = agentId;
        }
    }
    trackTaskComplete(taskId, status) {
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
                }
                else {
                    swarm.tasksFailed++;
                }
            }
        }
    }
    endSwarm(swarmId) {
        const swarm = this.swarmMetrics.get(swarmId);
        if (swarm) {
            swarm.endedAt = Date.now();
            swarm.totalDurationMs = swarm.endedAt - swarm.startedAt;
        }
        if (this.currentSwarmId === swarmId) {
            this.currentSwarmId = null;
        }
    }
    getSwarmMetrics(swarmId) {
        return this.swarmMetrics.get(swarmId);
    }
    getAgentMetrics(agentId) {
        return this.agentMetrics.get(agentId);
    }
    getTaskMetrics(taskId) {
        return this.taskMetrics.get(taskId);
    }
    getSwarmSummary(swarmId) {
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
            .map(m => m.durationMs);
        const avgAgentDurationMs = agentDurations.length > 0
            ? agentDurations.reduce((a, b) => a + b, 0) / agentDurations.length
            : 0;
        const taskDurations = Array.from(this.taskMetrics.values())
            .filter(m => m.durationMs !== undefined)
            .map(m => m.durationMs);
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
    clear() {
        this.agentMetrics.clear();
        this.taskMetrics.clear();
        this.swarmMetrics.clear();
        this.currentSwarmId = null;
    }
}
export const swarmTelemetry = new SwarmTelemetry();

export class Aggregator {
    db;
    constructor(db) {
        this.db = db;
    }
    aggregateResults() {
        const swarm = this.db.getSwarm();
        if (!swarm) {
            throw new Error('Swarm not found');
        }
        const tasks = this.db.getTasks();
        const agents = this.db.getAgents();
        const results = tasks.map(task => {
            const agent = task.agentId ? this.db.getAgent(task.agentId) : undefined;
            return {
                taskId: task.id,
                status: task.status,
                output: this.formatTaskOutput(task, agent),
                agentId: task.agentId,
            };
        });
        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        const failedTasks = tasks.filter(t => t.status === 'failed').length;
        return {
            swarmId: swarm.id,
            totalTasks: tasks.length,
            completedTasks,
            failedTasks,
            results,
            summary: this.generateSummary(tasks, agents),
        };
    }
    formatTaskOutput(task, agent) {
        if (!task)
            return 'Task not found';
        const lines = [`## ${task.description}`];
        lines.push(`Status: ${task.status}`);
        if (agent) {
            lines.push(`Agent: ${agent.role} (${agent.id.substring(0, 8)})`);
            if (agent.result) {
                lines.push(`Result: ${agent.result}`);
            }
            if (agent.error) {
                lines.push(`Error: ${agent.error}`);
            }
            lines.push(`Progress: ${Math.round(agent.progress * 100)}%`);
        }
        return lines.join('\n');
    }
    generateSummary(tasks, agents) {
        const lines = [];
        const completed = tasks.filter(t => t.status === 'completed').length;
        const failed = tasks.filter(t => t.status === 'failed').length;
        const total = tasks.length;
        lines.push(`## Swarm Results`);
        lines.push(`Tasks: ${completed}/${total} completed, ${failed} failed`);
        if (completed === total) {
            lines.push(`\n✅ All tasks completed successfully!`);
        }
        else if (failed > 0) {
            lines.push(`\n⚠️ ${failed} task(s) failed.`);
        }
        lines.push(`\n### Agent Summary`);
        for (const agent of agents) {
            const statusIcon = agent.status === 'completed' ? '✅' : agent.status === 'failed' ? '❌' : '🔄';
            lines.push(`- ${statusIcon} ${agent.role}: ${agent.status} (${Math.round(agent.progress * 100)}%)`);
        }
        return lines.join('\n');
    }
    getFailedTasks() {
        return this.db.getTasks().filter(t => t.status === 'failed');
    }
    getCompletedTasks() {
        return this.db.getTasks().filter(t => t.status === 'completed');
    }
    getPendingTasks() {
        return this.db.getTasks().filter(t => t.status === 'pending');
    }
    getInProgressTasks() {
        return this.db.getTasks().filter(t => t.status === 'in_progress');
    }
}
export function createAggregator(db) {
    return new Aggregator(db);
}

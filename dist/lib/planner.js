export function analyzeTaskDependencies(tasks) {
    return tasks.map(task => ({
        taskId: task.id,
        dependsOn: task.dependencies,
    }));
}
export function canRunParallel(task, completedTasks, allTasks) {
    if (task.dependencies.length === 0) {
        return true;
    }
    return task.dependencies.every(depId => {
        const depTask = allTasks.find(t => t.id === depId);
        return depTask && completedTasks.has(depId);
    });
}
export function determineExecutionStrategy(tasks) {
    if (tasks.length === 0) {
        return { type: 'sequential', maxParallel: 1, taskOrder: [] };
    }
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const hasDependencies = tasks.some(t => t.dependencies.length > 0);
    const independentTasks = tasks.filter(t => t.dependencies.length === 0);
    // Compute longest dependency chain (depth) using DFS with memoization
    const memo = new Map();
    const visiting = new Set();
    function depth(taskId) {
        if (memo.has(taskId))
            return memo.get(taskId);
        if (visiting.has(taskId)) {
            throw new Error(`Circular dependency detected for task ${taskId}`);
        }
        visiting.add(taskId);
        const task = taskMap.get(taskId);
        let d = 1;
        if (task) {
            for (const dep of task.dependencies) {
                d = Math.max(d, 1 + depth(dep));
            }
        }
        visiting.delete(taskId);
        memo.set(taskId, d);
        return d;
    }
    let longestChain = 0;
    for (const t of tasks) {
        longestChain = Math.max(longestChain, depth(t.id));
    }
    if (!hasDependencies) {
        return {
            type: 'parallel',
            maxParallel: Math.max(1, Math.min(independentTasks.length, 4)),
            taskOrder: independentTasks.map(t => t.id),
        };
    }
    // If there is a long dependency chain, prefer sequential execution
    if (longestChain >= 3) {
        return {
            type: 'sequential',
            maxParallel: 1,
            taskOrder: topologicalSort(tasks),
        };
    }
    // Otherwise use a hybrid approach when there are some independent tasks
    return {
        type: 'hybrid',
        maxParallel: Math.max(1, Math.min(independentTasks.length, 3)),
        taskOrder: tasks.map(t => t.id),
    };
}
export function topologicalSort(tasks) {
    const result = [];
    const visited = new Set();
    const visiting = new Set();
    function visit(taskId) {
        if (visited.has(taskId))
            return;
        if (visiting.has(taskId)) {
            throw new Error(`Circular dependency detected for task ${taskId}`);
        }
        visiting.add(taskId);
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            for (const dep of task.dependencies) {
                visit(dep);
            }
        }
        visiting.delete(taskId);
        visited.add(taskId);
        result.push(taskId);
    }
    for (const task of tasks) {
        visit(task.id);
    }
    return result;
}
export function getNextExecutableTasks(tasks, completedTasks, maxParallel) {
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    const executable = [];
    for (const task of pendingTasks) {
        if (executable.length >= maxParallel)
            break;
        if (canRunParallel(task, completedTasks, tasks)) {
            executable.push(task);
        }
    }
    return executable;
}
// Sort tasks by priority (higher first), then by creation order
export function sortTasksByPriority(tasks) {
    return [...tasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}
export function createPlannerPrompt(taskDescription, existingContext) {
    return `You are a technical architect planning a multi-agent swarm task.

## Task Description
${taskDescription}

## Existing Context
${existingContext || '(none)'}

## Your Job
1. Break down this task into specific, manageable subtasks
2. Identify dependencies between subtasks (which must complete before others can start)
3. Determine which subtasks can run in parallel
4. Assign each subtask to the appropriate agent role (coder, reviewer, tester, documenter)

## Output Format
Provide your plan as a structured list:
- Each subtask with a clear description
- Dependencies marked explicitly
- Recommended role for each subtask
- Tasks grouped by whether they can run in parallel

Be specific about WHAT each subtask should accomplish, not HOW to do it.`;
}

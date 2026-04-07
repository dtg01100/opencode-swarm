export type AgentRole = 'planner' | 'coder' | 'reviewer' | 'tester' | 'documenter' | 'worker';

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type EventType = 'progress' | 'complete' | 'fail' | 'handoff';

export interface Agent {
  id: string;
  role: AgentRole;
  status: AgentStatus;
  progress: number;
  result?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Task {
  id: string;
  agentId?: string;
  description: string;
  status: TaskStatus;
  dependencies: string[];
  createdAt: number;
  completedAt?: number;
  // Optional priority for scheduling across swarms. Higher number = higher priority
  priority?: number;
}

export interface SwarmEvent {
  id: number;
  agentId: string;
  type: EventType;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface SwarmState {
  id: string;
  rootSessionId: string;
  plannerSessionId?: string;
  status: 'planning' | 'executing' | 'completed' | 'aborted';
  createdAt: number;
  updatedAt: number;
}

export interface RoleDefinition {
  role: AgentRole;
  systemPrompt: string;
  tools: string[];
}

export interface SpawnOptions {
  role: AgentRole;
  taskId: string;
  context?: string;
  parentSessionId?: string;
  childSwarmId?: string;
  parentHandoffPath?: string;
}

export interface SubswarmOptions {
  parentSwarmId: string;
  taskDescription: string;
  parentSessionId: string;
  parentHandoffPath: string;
  timeoutMs?: number;
}

export interface ProgressReport {
  agentId: string;
  progress: number;
  message?: string;
}

export interface HandoffData {
  taskId: string;
  fromAgentId: string;
  toAgentId?: string;
  context: string;
  files: string[];
  decisions: string[];
}

export interface AggregatedResult {
  swarmId: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  results: {
    taskId: string;
    status: TaskStatus;
    output: string;
    agentId?: string;
  }[];
  summary: string;
}

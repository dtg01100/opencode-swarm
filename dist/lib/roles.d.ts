import type { AgentRole, RoleDefinition } from '../types.js';
export declare const DEFAULT_ROLES: Record<AgentRole, RoleDefinition>;
export declare function getRoleDefinition(role: AgentRole): RoleDefinition;
export declare function getSystemPromptForRole(role: AgentRole): string;
export declare function getToolsForRole(role: AgentRole): string[];
export declare function buildAgentSystemPrompt(role: AgentRole, task: string, context: string): string;
export declare function mergeCustomRoles(customRoles: Partial<Record<AgentRole, Partial<RoleDefinition>>>): void;

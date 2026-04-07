import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_ROLES,
  getRoleDefinition,
  getSystemPromptForRole,
  getToolsForRole,
  buildAgentSystemPrompt,
  mergeCustomRoles,
} from './roles.js';
import type { AgentRole } from '../types.js';

describe('roles', () => {
  describe('DEFAULT_ROLES', () => {
    it('should define all required agent roles', () => {
      const expectedRoles: AgentRole[] = ['planner', 'coder', 'reviewer', 'tester', 'documenter'];

      for (const role of expectedRoles) {
        expect(DEFAULT_ROLES[role]).toBeDefined();
        expect(DEFAULT_ROLES[role].role).toBe(role);
      }
    });

    it('should have valid system prompts for all roles', () => {
      const expectedRoles: AgentRole[] = ['planner', 'coder', 'reviewer', 'tester', 'documenter'];

      for (const role of expectedRoles) {
        expect(DEFAULT_ROLES[role].systemPrompt.length).toBeGreaterThan(0);
      }
    });

    it('should have tools arrays for all roles', () => {
      const expectedRoles: AgentRole[] = ['planner', 'coder', 'reviewer', 'tester', 'documenter'];

      for (const role of expectedRoles) {
        expect(Array.isArray(DEFAULT_ROLES[role].tools)).toBe(true);
        expect(DEFAULT_ROLES[role].tools.length).toBeGreaterThan(0);
      }
    });

    it('should have coder role with edit, write, read, bash tools', () => {
      const coderTools = DEFAULT_ROLES.coder.tools;
      expect(coderTools).toContain('edit');
      expect(coderTools).toContain('write');
      expect(coderTools).toContain('read');
      expect(coderTools).toContain('bash');
    });

    it('should have reviewer role with read, grep, bash tools', () => {
      const reviewerTools = DEFAULT_ROLES.reviewer.tools;
      expect(reviewerTools).toContain('read');
      expect(reviewerTools).toContain('grep');
      expect(reviewerTools).toContain('bash');
    });
  });

  describe('getRoleDefinition', () => {
    it('should return definition for valid role', () => {
      const result = getRoleDefinition('coder');
      expect(result.role).toBe('coder');
      expect(result.systemPrompt.length).toBeGreaterThan(0);
    });

    it('should return coder as default for unknown role', () => {
      const result = getRoleDefinition('unknown' as AgentRole);
      expect(result.role).toBe('coder');
    });

    it('should return same instance for same role', () => {
      const result1 = getRoleDefinition('planner');
      const result2 = getRoleDefinition('planner');
      expect(result1).toBe(result2);
    });
  });

  describe('getSystemPromptForRole', () => {
    it('should return non-empty string for valid role', () => {
      const result = getSystemPromptForRole('tester');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should include role-specific instructions', () => {
      const coderPrompt = getSystemPromptForRole('coder');
      expect(coderPrompt).toContain('implement');
      expect(coderPrompt).toContain('code');

      const testerPrompt = getSystemPromptForRole('tester');
      expect(testerPrompt).toContain('test');
      expect(testerPrompt).toContain('coverage');
    });
  });

  describe('getToolsForRole', () => {
    it('should return array of tool names', () => {
      const result = getToolsForRole('documenter');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return different tools for different roles', () => {
      const coderTools = getToolsForRole('coder');
      const reviewerTools = getToolsForRole('reviewer');

      expect(coderTools).not.toEqual(reviewerTools);
    });

    it('should include bash for appropriate roles', () => {
      const coderTools = getToolsForRole('coder');
      expect(coderTools).toContain('bash');
    });
  });

  describe('buildAgentSystemPrompt', () => {
    it('should include role system prompt', () => {
      const result = buildAgentSystemPrompt('coder', 'Fix bug', '');
      expect(result).toContain(DEFAULT_ROLES.coder.systemPrompt);
    });

    it('should include task description', () => {
      const result = buildAgentSystemPrompt('coder', 'Fix login bug', '');
      expect(result).toContain('Fix login bug');
    });

    it('should include context when provided', () => {
      const result = buildAgentSystemPrompt('coder', 'Add feature', 'Use JWT tokens');
      expect(result).toContain('Use JWT tokens');
    });

    it('should not include context section when empty', () => {
      const result = buildAgentSystemPrompt('coder', 'Fix bug', '');
      expect(result).not.toContain('## Context\n\n\n');
    });

    it('should include available tools section', () => {
      const result = buildAgentSystemPrompt('reviewer', 'Review PR', '');
      expect(result).toContain('## Swarm Tools');
    });

    it('should list role-specific tools', () => {
      const result = buildAgentSystemPrompt('coder', 'Implement API', '');
      const coderTools = getToolsForRole('coder');
      for (const tool of coderTools) {
        expect(result).toContain(tool);
      }
    });

    it('should include swarm-progress instruction', () => {
      const result = buildAgentSystemPrompt('tester', 'Write tests', '');
      expect(result).toContain('swarm-progress');
    });

    it('should handle multiline context', () => {
      const context = `Line 1
Line 2
Line 3`;
      const result = buildAgentSystemPrompt('planner', 'Plan project', context);
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
    });
  });

  describe('mergeCustomRoles', () => {
    const originalRoles = { ...DEFAULT_ROLES };

    beforeEach(() => {
      Object.assign(DEFAULT_ROLES, originalRoles);
    });

    it('should override specific fields of existing role', () => {
      mergeCustomRoles({
        coder: {
          systemPrompt: 'Custom coder prompt',
        },
      });

      expect(DEFAULT_ROLES.coder.systemPrompt).toBe('Custom coder prompt');
      expect(DEFAULT_ROLES.coder.tools).toEqual(originalRoles.coder.tools);
    });

    it('should preserve unmodified roles', () => {
      const originalPlanner = { ...DEFAULT_ROLES.planner };

      mergeCustomRoles({
        coder: {
          systemPrompt: 'Custom prompt',
        },
      });

      expect(DEFAULT_ROLES.planner.role).toBe(originalPlanner.role);
      expect(DEFAULT_ROLES.planner.tools).toEqual(originalPlanner.tools);
    });

    it('should handle partial role definition', () => {
      mergeCustomRoles({
        tester: {
          tools: ['custom-tool'],
        },
      });

      expect(DEFAULT_ROLES.tester.tools).toContain('custom-tool');
    });

    it('should not affect unknown roles', () => {
      expect(() => {
        mergeCustomRoles({
          unknown: {
            systemPrompt: 'test',
          },
        } as any);
      }).not.toThrow();
    });
  });
});
import type { Event } from '@opencode-ai/sdk';
import { CoordinatorManager } from './lib/coordinator-manager.js';
type AnyContext = any;
export declare function setupEventHandlers(ctx: AnyContext, coordinatorManager: CoordinatorManager): {
    event?: (input: {
        event: Event;
    }) => Promise<void>;
};
export {};

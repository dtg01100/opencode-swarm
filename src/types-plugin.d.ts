import type { OpencodeClient } from '@opencode-ai/sdk/client';

// Augment the OpencodeClient type to include the properties the plugin expects
declare module '@opencode-ai/sdk/client' {
  interface OpencodeClient {
    /**
     * Current session ID - added by opencode-swarm plugin
     * This is set by the opencode runtime when initializing plugins
     */
    session: OpencodeClient['session'] & {
      id: string;
    };
  }
}

// Augment the Plugin module to include additional properties
declare module '@opencode-ai/plugin' {
  export interface PluginInput {
    /**
     * Additional properties added by opencode-swarm
     */
    on?: (event: string, handler: (event: any) => void) => void;
  }

  export interface Hooks {
    /**
     * Extended to support command registration
     */
    command?: (name: string, handler: (args: string, ctx: PluginInput) => Promise<{ success: boolean; message: string }>) => void;
  }
}

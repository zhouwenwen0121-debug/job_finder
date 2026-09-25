/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mcpToTool } from '@google/genai';
import { filterDiscoveredTools, isToolSafe, type MCPToolInfo } from './toolFilter.ts';

export type MCPConnectionStatus = 'connected' | 'requires_auth' | 'unavailable' | 'disconnected';

export interface ToolExecutionRecord {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: any;
  error?: string;
  timestamp: string;
}

export interface MCPStatusPayload {
  status: MCPConnectionStatus;
  message: string;
  endpoint: string;
  discoveredCount: number;
  enabledCount: number;
  blockedCount: number;
  tools: Array<{
    name: string;
    description: string;
    category: string;
    enabled: boolean;
    reason?: string;
  }>;
  recentExecutions: ToolExecutionRecord[];
  lastChecked: string;
}

class SmitheryClientManager {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private status: MCPConnectionStatus = 'disconnected';
  private errorMessage = 'The career-data MCP service is currently unavailable.';
  private discoveredTools: MCPToolInfo[] = [];
  private safeTools: MCPToolInfo[] = [];
  private blockedTools: Array<{ tool: MCPToolInfo; reason: string }> = [];
  private toolExecutionHistory: ToolExecutionRecord[] = [];
  private isConnecting = false;
  private lastCheckTime = '';

  /**
   * Sanitizes endpoint URL for safe UI display (strips secrets if any were embedded)
   */
  public getSanitizedEndpoint(): string {
    const raw = process.env.SMITHERY_MCP_URL || 'https://mcp.smithery.ai/zhouwenwen0121?mode=smart';
    try {
      const u = new URL(raw);
      u.password = '';
      u.username = '';
      return u.toString();
    } catch {
      return 'https://mcp.smithery.ai/zhouwenwen0121?mode=smart';
    }
  }

  /**
   * Connects to Smithery MCP gateway, discovers tools, and filters safe capabilities.
   */
  public async connect(): Promise<boolean> {
    if (this.isConnecting) return false;
    this.isConnecting = true;

    // Clean up previous connection if exists
    await this.disconnect();

    const mcpUrlStr = process.env.SMITHERY_MCP_URL || 'https://mcp.smithery.ai/zhouwenwen0121?mode=smart';
    const apiKey = process.env.SMITHERY_API_KEY || process.env.SMITHERY_TOKEN;

    try {
      const url = new URL(mcpUrlStr);

      const headers: Record<string, string> = {
        'Accept': 'application/json, text/event-stream'
      };

      if (apiKey && apiKey.trim().length > 0) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }

      this.transport = new StreamableHTTPClientTransport(url, {
        requestInit: {
          headers
        }
      });

      this.client = new Client(
        {
          name: 'ai-hr-career-assistant',
          version: '1.0.0'
        },
        {
          capabilities: {}
        }
      );

      // Connect transport
      await this.client.connect(this.transport);

      // Call tools/list on MCP server
      const listResult = await this.client.listTools();
      const rawTools: MCPToolInfo[] = listResult.tools || [];
      this.discoveredTools = rawTools;

      // Apply safety filter (fail-closed for side effects)
      const filtered = filterDiscoveredTools(rawTools);
      this.safeTools = filtered.safeTools;
      this.blockedTools = filtered.blockedTools;

      // Wrap client.listTools to return only safeTools so mcpToTool uses only safe tools
      const originalListTools = this.client.listTools.bind(this.client);
      this.client.listTools = async (params, options) => {
        const res = await originalListTools(params, options);
        const safeOnly = (res.tools || []).filter(t => isToolSafe(t).safe);
        return {
          ...res,
          tools: safeOnly
        };
      };

      // Wrap client.callTool to guard against disallowed tools and safely handle provider errors
      const originalCallTool = this.client.callTool.bind(this.client);
      this.client.callTool = async (params, options) => {
        const toolName = params.name;
        const toolDef = this.discoveredTools.find(t => t.name === toolName);

        // Disallow unverified or blocked tools
        if (toolDef && !isToolSafe(toolDef).safe) {
          const check = isToolSafe(toolDef);
          throw new Error(`Tool "${toolName}" is blocked by safety policy: ${check.reason}`);
        }

        const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const record: ToolExecutionRecord = {
          id: executionId,
          name: toolName,
          args: (params.arguments as Record<string, any>) || {},
          timestamp: new Date().toISOString()
        };

        try {
          const result = await originalCallTool(params, options);
          record.result = result;
          this.recordExecution(record);
          return result;
        } catch (callErr: any) {
          // If one underlying MCP provider fails, return a graceful response so Gemini can proceed
          record.error = callErr?.message || 'External tool error';
          this.recordExecution(record);

          return {
            content: [
              {
                type: 'text',
                text: `Tool "${toolName}" encountered an external provider issue: ${callErr?.message || 'Unknown error'}. Please continue using general HR reasoning or other available tools.`
              }
            ]
          };
        }
      };

      this.status = 'connected';
      this.errorMessage = '';
      this.lastCheckTime = new Date().toISOString();
      return true;
    } catch (err: any) {
      const errMsg = String(err?.message || err || '');
      const errCode = String(err?.code || '');
      const errStatus = String(err?.status || '');

      // Check for authentication requirement (HTTP 401 / unauthorized / missing authorization header)
      if (
        errMsg.includes('401') ||
        errMsg.toLowerCase().includes('unauthorized') ||
        errMsg.toLowerCase().includes('missing authorization') ||
        errCode === '401' ||
        errStatus === '401'
      ) {
        this.status = 'requires_auth';
        this.errorMessage = 'The MCP service requires authentication.';
      } else {
        this.status = 'unavailable';
        this.errorMessage = 'The career-data MCP service is currently unavailable.';
      }

      this.client = null;
      this.transport = null;
      this.discoveredTools = [];
      this.safeTools = [];
      this.blockedTools = [];
      this.lastCheckTime = new Date().toISOString();
      return false;
    } finally {
      this.isConnecting = false;
    }
  }

  private recordExecution(record: ToolExecutionRecord) {
    this.toolExecutionHistory.unshift(record);
    if (this.toolExecutionHistory.length > 20) {
      this.toolExecutionHistory.pop();
    }
  }

  /**
   * Closes and cleans up client connection.
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // Ignore cleanup errors
      }
      this.client = null;
    }
    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        // Ignore cleanup errors
      }
      this.transport = null;
    }
  }

  /**
   * Returns mcpToTool callable tool instance if connected and safe tools exist.
   * Returns null if disconnected or no safe tools available.
   */
  public getGeminiTool(): any | null {
    if (this.status !== 'connected' || !this.client || this.safeTools.length === 0) {
      return null;
    }
    try {
      return mcpToTool(this.client);
    } catch {
      return null;
    }
  }

  /**
   * Provides non-sensitive status payload for UI.
   */
  public getStatusPayload(): MCPStatusPayload {
    const toolsPayload = this.discoveredTools.map(t => {
      const filterRes = isToolSafe(t);
      return {
        name: t.name,
        description: t.description || 'No description provided.',
        category: filterRes.category,
        enabled: filterRes.safe,
        reason: filterRes.reason
      };
    });

    return {
      status: this.status,
      message: this.errorMessage,
      endpoint: this.getSanitizedEndpoint(),
      discoveredCount: this.discoveredTools.length,
      enabledCount: this.safeTools.length,
      blockedCount: this.blockedTools.length,
      tools: toolsPayload,
      recentExecutions: this.toolExecutionHistory,
      lastChecked: this.lastCheckTime || new Date().toISOString()
    };
  }

  public getErrorMessage(): string {
    return this.errorMessage;
  }

  public getSafeToolsCount(): number {
    return this.safeTools.length;
  }

  public isConnected(): boolean {
    return this.status === 'connected' && this.client !== null;
  }
}

// Singleton instance for server lifecycle
export const smitheryManager = new SmitheryClientManager();

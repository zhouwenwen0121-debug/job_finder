/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mcpToTool } from '@google/genai';
import { isToolSafe, type MCPToolInfo } from './toolFilter.ts';

export type SingleServerStatus = 'connected' | 'unavailable';

export interface ServerState {
  name: 'Indeed' | 'Glassdoor';
  endpoint: string;
  status: SingleServerStatus;
  message: string;
  discoveredCount: number;
  enabledCount: number;
  tools: Array<{
    name: string;
    description: string;
    enabled: boolean;
  }>;
}

export interface McpSystemStatus {
  hasApiKey: boolean;
  configError?: string;
  indeed: ServerState;
  glassdoor: ServerState;
  overall: 'connected' | 'partial' | 'unavailable';
  overallMessage: string;
  lastChecked: string;
}

class HasDataMcpManager {
  private indeedClient: Client | null = null;
  private indeedTransport: StreamableHTTPClientTransport | null = null;
  private glassdoorClient: Client | null = null;
  private glassdoorTransport: StreamableHTTPClientTransport | null = null;
  private lastConnectedApiKey: string | null = null;

  private indeedState: ServerState = {
    name: 'Indeed',
    endpoint: 'https://mcp.hasdata.com/mcp?apis=indeed',
    status: 'unavailable',
    message: 'Indeed job search is currently unavailable.',
    discoveredCount: 0,
    enabledCount: 0,
    tools: []
  };

  private glassdoorState: ServerState = {
    name: 'Glassdoor',
    endpoint: 'https://mcp.hasdata.com/mcp?apis=glassdoor',
    status: 'unavailable',
    message: 'Glassdoor job search is currently unavailable.',
    discoveredCount: 0,
    enabledCount: 0,
    tools: []
  };

  private lastCheckTime = '';
  private isConnecting = false;

  public hasApiKeyConfigured(): boolean {
    const key = (process.env.HASDATA_API_KEY || '').trim();
    return key.length > 0;
  }

  public async ensureConnected(): Promise<McpSystemStatus> {
    const currentKey = (process.env.HASDATA_API_KEY || '').trim();
    if (!currentKey) {
      // Key missing: mark states cleanly as unavailable due to missing server configuration
      await this.disconnectIndeed();
      await this.disconnectGlassdoor();
      this.lastConnectedApiKey = null;
      this.indeedState = {
        name: 'Indeed',
        endpoint: 'https://mcp.hasdata.com/mcp?apis=indeed',
        status: 'unavailable',
        message: 'Indeed job search is unavailable: HASDATA_API_KEY is not configured in server environment.',
        discoveredCount: 0,
        enabledCount: 0,
        tools: []
      };
      this.glassdoorState = {
        name: 'Glassdoor',
        endpoint: 'https://mcp.hasdata.com/mcp?apis=glassdoor',
        status: 'unavailable',
        message: 'Glassdoor job search is unavailable: HASDATA_API_KEY is not configured in server environment.',
        discoveredCount: 0,
        enabledCount: 0,
        tools: []
      };
      this.lastCheckTime = new Date().toISOString();
      return this.getStatusPayload();
    }

    // If key has changed or not yet connected
    if (this.lastConnectedApiKey !== currentKey || (!this.indeedClient && !this.glassdoorClient)) {
      return await this.connectAll();
    }

    return this.getStatusPayload();
  }

  public async connectAll(): Promise<McpSystemStatus> {
    if (this.isConnecting) {
      return this.getStatusPayload();
    }
    this.isConnecting = true;

    try {
      const apiKey = (process.env.HASDATA_API_KEY || '').trim();
      if (!apiKey) {
        await this.disconnectIndeed();
        await this.disconnectGlassdoor();
        this.lastConnectedApiKey = null;
        this.indeedState.status = 'unavailable';
        this.indeedState.message = 'Indeed job search is unavailable: HASDATA_API_KEY is not configured in server environment.';
        this.glassdoorState.status = 'unavailable';
        this.glassdoorState.message = 'Glassdoor job search is unavailable: HASDATA_API_KEY is not configured in server environment.';
        return this.getStatusPayload();
      }

      await Promise.all([
        this.connectIndeed(apiKey),
        this.connectGlassdoor(apiKey)
      ]);
      this.lastConnectedApiKey = apiKey;
    } finally {
      this.lastCheckTime = new Date().toISOString();
      this.isConnecting = false;
    }

    return this.getStatusPayload();
  }

  private async connectIndeed(apiKey: string): Promise<void> {
    await this.disconnectIndeed();

    const url = new URL('https://mcp.hasdata.com/mcp?apis=indeed');

    const headers: Record<string, string> = {
      'Accept': 'application/json, text/event-stream'
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      this.indeedTransport = new StreamableHTTPClientTransport(url, {
        requestInit: { headers }
      });

      this.indeedClient = new Client(
        { name: 'career-indeed-client', version: '1.0.0' },
        { capabilities: {} }
      );

      await this.indeedClient.connect(this.indeedTransport);

      const listResult = await this.indeedClient.listTools();
      const rawTools: MCPToolInfo[] = listResult.tools || [];
      const safeTools = rawTools.filter(t => isToolSafe(t).safe);

      // Wrap listTools to return only safe read-only tools
      const origListTools = this.indeedClient.listTools.bind(this.indeedClient);
      this.indeedClient.listTools = async (params, options) => {
        const res = await origListTools(params, options);
        return {
          ...res,
          tools: (res.tools || []).filter(t => isToolSafe(t).safe)
        };
      };

      // Wrap callTool to safely handle errors without exposing auth headers
      const origCallTool = this.indeedClient.callTool.bind(this.indeedClient);
      this.indeedClient.callTool = async (params, options) => {
        const toolDef = rawTools.find(t => t.name === params.name);
        if (toolDef && !isToolSafe(toolDef).safe) {
          throw new Error(`Tool "${params.name}" is disabled by security policy.`);
        }
        try {
          return await origCallTool(params, options);
        } catch (err: any) {
          return {
            content: [
              {
                type: 'text',
                text: `Indeed tool call encountered an error: ${err?.message || 'Remote request error'}.`
              }
            ]
          };
        }
      };

      this.indeedState = {
        name: 'Indeed',
        endpoint: 'https://mcp.hasdata.com/mcp?apis=indeed',
        status: 'connected',
        message: '',
        discoveredCount: rawTools.length,
        enabledCount: safeTools.length,
        tools: rawTools.map(t => ({
          name: t.name,
          description: t.description || 'No description provided.',
          enabled: isToolSafe(t).safe
        }))
      };
    } catch {
      await this.disconnectIndeed();
      this.indeedState = {
        name: 'Indeed',
        endpoint: 'https://mcp.hasdata.com/mcp?apis=indeed',
        status: 'unavailable',
        message: 'Indeed job search is currently unavailable.',
        discoveredCount: 0,
        enabledCount: 0,
        tools: []
      };
    }
  }

  private async connectGlassdoor(apiKey: string): Promise<void> {
    await this.disconnectGlassdoor();

    const url = new URL('https://mcp.hasdata.com/mcp?apis=glassdoor');

    const headers: Record<string, string> = {
      'Accept': 'application/json, text/event-stream'
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      this.glassdoorTransport = new StreamableHTTPClientTransport(url, {
        requestInit: { headers }
      });

      this.glassdoorClient = new Client(
        { name: 'career-glassdoor-client', version: '1.0.0' },
        { capabilities: {} }
      );

      await this.glassdoorClient.connect(this.glassdoorTransport);

      const listResult = await this.glassdoorClient.listTools();
      const rawTools: MCPToolInfo[] = listResult.tools || [];
      const safeTools = rawTools.filter(t => isToolSafe(t).safe);

      // Wrap listTools to return only safe read-only tools
      const origListTools = this.glassdoorClient.listTools.bind(this.glassdoorClient);
      this.glassdoorClient.listTools = async (params, options) => {
        const res = await origListTools(params, options);
        return {
          ...res,
          tools: (res.tools || []).filter(t => isToolSafe(t).safe)
        };
      };

      // Wrap callTool to safely handle errors without exposing auth headers
      const origCallTool = this.glassdoorClient.callTool.bind(this.glassdoorClient);
      this.glassdoorClient.callTool = async (params, options) => {
        const toolDef = rawTools.find(t => t.name === params.name);
        if (toolDef && !isToolSafe(toolDef).safe) {
          throw new Error(`Tool "${params.name}" is disabled by security policy.`);
        }
        try {
          return await origCallTool(params, options);
        } catch (err: any) {
          return {
            content: [
              {
                type: 'text',
                text: `Glassdoor tool call encountered an error: ${err?.message || 'Remote request error'}.`
              }
            ]
          };
        }
      };

      this.glassdoorState = {
        name: 'Glassdoor',
        endpoint: 'https://mcp.hasdata.com/mcp?apis=glassdoor',
        status: 'connected',
        message: '',
        discoveredCount: rawTools.length,
        enabledCount: safeTools.length,
        tools: rawTools.map(t => ({
          name: t.name,
          description: t.description || 'No description provided.',
          enabled: isToolSafe(t).safe
        }))
      };
    } catch {
      await this.disconnectGlassdoor();
      this.glassdoorState = {
        name: 'Glassdoor',
        endpoint: 'https://mcp.hasdata.com/mcp?apis=glassdoor',
        status: 'unavailable',
        message: 'Glassdoor job search is currently unavailable.',
        discoveredCount: 0,
        enabledCount: 0,
        tools: []
      };
    }
  }

  private async disconnectIndeed(): Promise<void> {
    if (this.indeedClient) {
      try { await this.indeedClient.close(); } catch {}
      this.indeedClient = null;
    }
    if (this.indeedTransport) {
      try { await this.indeedTransport.close(); } catch {}
      this.indeedTransport = null;
    }
  }

  private async disconnectGlassdoor(): Promise<void> {
    if (this.glassdoorClient) {
      try { await this.glassdoorClient.close(); } catch {}
      this.glassdoorClient = null;
    }
    if (this.glassdoorTransport) {
      try { await this.glassdoorTransport.close(); } catch {}
      this.glassdoorTransport = null;
    }
  }

  /**
   * Returns a Gemini-compatible callable tool via mcpToTool.
   * If both clients are connected, both are combined.
   * If only one is connected, only that client is returned.
   * If neither is connected, returns null.
   */
  public getGeminiTools(): any | null {
    const clients: Client[] = [];
    if (this.indeedState.status === 'connected' && this.indeedClient && this.indeedState.enabledCount > 0) {
      clients.push(this.indeedClient);
    }
    if (this.glassdoorState.status === 'connected' && this.glassdoorClient && this.glassdoorState.enabledCount > 0) {
      clients.push(this.glassdoorClient);
    }

    if (clients.length === 1) {
      return mcpToTool(clients[0]);
    }
    if (clients.length >= 2) {
      return mcpToTool(clients[0], clients[1]);
    }
    return null;
  }

  public getStatusPayload(): McpSystemStatus {
    const hasApiKey = this.hasApiKeyConfigured();
    const indeedConnected = this.indeedState.status === 'connected';
    const glassdoorConnected = this.glassdoorState.status === 'connected';

    let overall: 'connected' | 'partial' | 'unavailable' = 'unavailable';
    let overallMessage = 'Job search is currently unavailable. Please try again later.';
    let configError: string | undefined = undefined;

    if (!hasApiKey) {
      configError = 'HASDATA_API_KEY is not configured in server environment variables. Please set HASDATA_API_KEY in your server environment (or Vercel project settings) to connect to Indeed and Glassdoor MCP servers.';
      overallMessage = 'HASDATA_API_KEY is missing in server environment. Configure HASDATA_API_KEY to enable Indeed and Glassdoor job search.';
    } else if (indeedConnected && glassdoorConnected) {
      overall = 'connected';
      overallMessage = 'Both Indeed and Glassdoor MCP services are connected.';
    } else if (indeedConnected || glassdoorConnected) {
      overall = 'partial';
      overallMessage = indeedConnected
        ? 'Indeed MCP connected. Glassdoor job search is currently unavailable.'
        : 'Glassdoor MCP connected. Indeed job search is currently unavailable.';
    }

    return {
      hasApiKey,
      configError,
      indeed: { ...this.indeedState },
      glassdoor: { ...this.glassdoorState },
      overall,
      overallMessage,
      lastChecked: this.lastCheckTime || new Date().toISOString()
    };
  }

  public isAnyConnected(): boolean {
    return this.indeedState.status === 'connected' || this.glassdoorState.status === 'connected';
  }
}

export const mcpManager = new HasDataMcpManager();

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { smitheryManager } from './lib/mcp/smitheryClient.ts';

// Initialize environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Shared Gemini API Client on the server side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Attempt initial Smithery connection on startup
smitheryManager.connect().catch((err) => {
  console.error('Initial Smithery MCP connection attempt finished with state:', smitheryManager.getStatusPayload().status);
});

// API: Get current MCP gateway status, tools, and recent execution logs
app.get('/api/mcp/status', (_req: Request, res: Response) => {
  res.json(smitheryManager.getStatusPayload());
});

// API: Force refresh / reconnect to Smithery MCP gateway
app.post('/api/mcp/refresh', async (_req: Request, res: Response) => {
  await smitheryManager.connect();
  res.json(smitheryManager.getStatusPayload());
});

// API: AI HR Assistant Chat with Gemini & MCP tools integration
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const mcpStatus = smitheryManager.getStatusPayload();
    const callableTool = smitheryManager.getGeminiTool();

    // System instruction defining CareerPilot's role, safety guidelines, and tool usage
    let systemInstruction = `You are CareerPilot, a senior AI Human Resources & Career Intelligence Specialist.
Your mission is to guide job seekers, hiring managers, and HR professionals with:
1. Job Search & Opportunity Discovery (e.g. Indeed, Google Jobs, Laddro, Glassdoor)
2. Resume Analysis, ATS Compatibility & Resume Tailoring
3. Compelling Cover Letter Generation
4. Global & Regional Labor Market Statistics & Unemployment Trends (e.g. ILOSTAT, OECD)
5. Skill Taxonomies, Role Progression & Competency Frameworks (e.g. skill-repo, pm-skills)
6. Company Research, Culture & Salary Insights

CRITICAL SAFETY & OPERATION RULES:
- You must ONLY use the provided MCP tools for read-only retrieval, search, matching, and analysis.
- You must NEVER attempt or claim to auto-apply to jobs, send emails, modify external profiles, or spend money.
- Do NOT claim that a specific provider (like Indeed, Glassdoor, ILO, or OECD) was used UNLESS you actually executed an MCP tool from that provider.
`;

    // Inform model of MCP state so it can inform user accurately
    if (mcpStatus.status === 'requires_auth') {
      systemInstruction += `\nNOTICE: The external career MCP gateway requires authentication. If the user explicitly asks for real-time external tool data or job search via external servers, state clearly: "The MCP service requires authentication." and then provide guidance based on your core HR knowledge.`;
    } else if (mcpStatus.status === 'unavailable' || mcpStatus.status === 'disconnected') {
      systemInstruction += `\nNOTICE: The career-data MCP service is currently unavailable. If the user explicitly requests live data from the external MCP tools, state clearly: "The career-data MCP service is currently unavailable." and provide comprehensive guidance using your foundational knowledge.`;
    } else if (mcpStatus.status === 'connected') {
      systemInstruction += `\nThe external MCP gateway is connected with ${mcpStatus.enabledCount} enabled safe tools. Proactively select and invoke the most suitable MCP tool to answer queries regarding live jobs, labor stats, resume analysis, or skill requirements.`;
    }

    // Build contents array including conversation history
    const contents: any[] = [];

    if (Array.isArray(history)) {
      for (const item of history) {
        if (item.role === 'user' || item.role === 'model') {
          contents.push({
            role: item.role,
            parts: [{ text: item.text }]
          });
        }
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const config: any = {
      systemInstruction,
    };

    // Attach discovered MCP tools via mcpToTool if available
    if (callableTool && mcpStatus.enabledCount > 0) {
      config.tools = [callableTool];
    }

    // Resilient generation cascade across approved Gemini models
    const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let response: any = null;
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents,
          config,
        });
        break; // Successfully generated content
      } catch (callErr: any) {
        lastError = callErr;
        const msg = String(callErr?.message || callErr || '');
        console.warn(`Model ${modelName} call failed (${msg.slice(0, 80)}). Trying fallback...`);
      }
    }

    if (!response) {
      throw lastError || new Error('All model candidates failed to respond.');
    }

    const responseText = response.text || 'I analyzed your request, but could not produce a text response.';

    // Fetch updated execution records to report tool invocations to client
    const updatedStatus = smitheryManager.getStatusPayload();

    res.json({
      response: responseText,
      mcpStatus: updatedStatus,
      recentExecutions: updatedStatus.recentExecutions.slice(0, 5)
    });
  } catch (err: any) {
    console.error('Chat endpoint error:', err);
    res.status(500).json({
      error: 'Failed to process career assistant request',
      details: err?.message || 'Unknown internal error'
    });
  }
});

// Configure Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CareerPilot server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

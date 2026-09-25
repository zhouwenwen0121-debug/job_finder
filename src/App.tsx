/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Briefcase,
  Search,
  FileText,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Server,
  RefreshCw,
  Send,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Award,
  AlertTriangle,
  Info,
  Layers,
  BarChart3,
  Bot,
  User,
  ExternalLink,
  Cpu
} from 'lucide-react';

interface ToolItem {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  reason?: string;
}

interface ToolExecution {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: any;
  error?: string;
  timestamp: string;
}

interface MCPStatus {
  status: 'connected' | 'requires_auth' | 'unavailable' | 'disconnected';
  message: string;
  endpoint: string;
  discoveredCount: number;
  enabledCount: number;
  blockedCount: number;
  tools: ToolItem[];
  recentExecutions: ToolExecution[];
  lastChecked: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  toolInvocations?: ToolExecution[];
  timestamp: string;
}

export default function App() {
  const [mcpStatus, setMcpStatus] = useState<MCPStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [refreshingMcp, setRefreshingMcp] = useState<boolean>(false);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [diagnosticTab, setDiagnosticTab] = useState<'tools' | 'executions' | 'policy'>('tools');
  const [toolSearch, setToolSearch] = useState<string>('');
  const [toolCategoryFilter, setToolCategoryFilter] = useState<string>('all');

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: `Hello! I am **CareerPilot**, your AI HR & Career Intelligence Specialist powered by Gemini and connected to the Smithery MCP gateway.

I can assist you with:
- **Real-time Job Search & Opportunity Matching**
- **ATS Resume Analysis & Tailoring**
- **Tailored Cover Letter Generation**
- **Labor Market Trends & Global Unemployment Statistics (ILO / OECD)**
- **Competency Frameworks & Product Management / Tech Skills Roadmap**

How can I help advance your career or hiring workflow today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Resume Analyzer Workspace State
  const [activeView, setActiveView] = useState<'chat' | 'resume-matcher' | 'labor-skills'>('chat');
  const [resumeText, setResumeText] = useState<string>('');
  const [jobDescription, setJobDescription] = useState<string>('');
  const [matchingAction, setMatchingAction] = useState<string | null>(null);

  // Fetch MCP status on mount
  useEffect(() => {
    fetchMcpStatus();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const fetchMcpStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/mcp/status');
      if (res.ok) {
        const data: MCPStatus = await res.json();
        setMcpStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch MCP status', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleRefreshMcp = async () => {
    setRefreshingMcp(true);
    try {
      const res = await fetch('/api/mcp/refresh', { method: 'POST' });
      if (res.ok) {
        const data: MCPStatus = await res.json();
        setMcpStatus(data);
      }
    } catch (err) {
      console.error('Failed to refresh MCP', err);
    } finally {
      setRefreshingMcp(false);
    }
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || inputMessage;
    if (!textToSend.trim() || sending) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customPrompt) setInputMessage('');
    setSending(true);

    try {
      // Build conversation history format for backend
      const history = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({
          role: m.role,
          text: m.text
        }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend.trim(),
          history
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with ${res.status}`);
      }

      const data = await res.json();

      if (data.mcpStatus) {
        setMcpStatus(data.mcpStatus);
      }

      const botMsg: ChatMessage = {
        id: `bot_${Date.now()}`,
        role: 'model',
        text: data.response,
        toolInvocations: data.recentExecutions || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'model',
        text: mcpStatus?.status === 'requires_auth'
          ? 'The MCP service requires authentication.\n\nWhile external career tools are awaiting credentials, I can still provide expert guidance using standard HR industry benchmarks.'
          : mcpStatus?.status === 'unavailable'
            ? 'The career-data MCP service is currently unavailable.\n\nPlease check back shortly or let me assist you with foundational career strategy and resume critique.'
            : `An error occurred: ${err.message || 'Unable to connect to the assistant'}. Please try again.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const triggerAnalyzeResume = (action: 'compare' | 'tailor' | 'coverletter') => {
    if (!resumeText.trim()) {
      alert('Please enter or paste your resume content.');
      return;
    }
    setActiveView('chat');
    let prompt = '';
    if (action === 'compare') {
      prompt = `Please compare this resume against this job description.\n\nRESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription || 'Standard Senior Software Engineer expectations'}\n\nEvaluate fit, provide match score (1-100), identify keyword gaps, and detail ATS recommendations.`;
    } else if (action === 'tailor') {
      prompt = `Please tailor my resume for this position:\n\nTARGET ROLE/DESCRIPTION:\n${jobDescription || 'Senior Full-Stack Engineer'}\n\nCURRENT RESUME:\n${resumeText}\n\nHighlight quantifiable impact, optimize phrasing, and align competencies without fabricating experience.`;
    } else {
      prompt = `Generate a compelling cover letter for this position:\n\nJOB DESCRIPTION:\n${jobDescription || 'Role at technology company'}\n\nBASED ON MY RESUME:\n${resumeText}\n\nEnsure a professional, engaging tone that articulates unique value.`;
    }
    handleSendMessage(prompt);
  };

  const quickPrompts = [
    { label: 'React Jobs in Singapore', query: 'Find senior React jobs in Singapore.' },
    { label: 'Unemployment in SG', query: 'What is the unemployment rate in Singapore based on official labor statistics?' },
    { label: 'PM Skill Roadmap', query: 'What skills should a product manager develop according to core PM frameworks?' },
    { label: 'Resume ATS Tips', query: 'What are the top 5 ATS resume pitfalls to avoid in technical hiring?' },
  ];

  // Filter tools for diagnostic panel
  const filteredTools = (mcpStatus?.tools || []).filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
      tool.description.toLowerCase().includes(toolSearch.toLowerCase());
    if (toolCategoryFilter === 'all') return matchesSearch;
    if (toolCategoryFilter === 'enabled') return matchesSearch && tool.enabled;
    if (toolCategoryFilter === 'blocked') return matchesSearch && !tool.enabled;
    return matchesSearch && tool.category === toolCategoryFilter;
  });

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md px-4 py-3 shrink-0 flex flex-wrap items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-bold">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-white">CareerPilot AI</h1>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Gemini + MCP
              </span>
            </div>
            <p className="text-xs text-slate-400">Smart HR & Career Intelligence Gateway</p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-slate-800/70 p-1 rounded-xl border border-slate-700/60 text-xs font-medium">
          <button
            onClick={() => setActiveView('chat')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeView === 'chat'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Assistant Chat</span>
          </button>
          <button
            onClick={() => setActiveView('resume-matcher')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeView === 'resume-matcher'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Resume & Matcher</span>
          </button>
          <button
            onClick={() => setActiveView('labor-skills')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeView === 'labor-skills'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Labor & Skills</span>
          </button>
        </div>

        {/* MCP Status Indicator & Controls */}
        <div className="flex items-center gap-2">
          {/* Status Pill */}
          <div
            onClick={() => setShowDiagnostics(true)}
            className="cursor-pointer group flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-slate-800/60 hover:bg-slate-800 transition-all border-slate-700/70 text-xs"
            title="Click to view MCP Diagnostics & Tool Inspection"
          >
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                {mcpStatus?.status === 'connected' ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </>
                ) : mcpStatus?.status === 'requires_auth' ? (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                )}
              </span>
              <span className="font-medium text-slate-200">
                Smithery: {mcpStatus?.status === 'connected' ? 'Connected' : mcpStatus?.status === 'requires_auth' ? 'Requires Auth' : 'Disconnected'}
              </span>
            </div>

            <div className="h-3 w-px bg-slate-700 mx-0.5"></div>

            <div className="text-[11px] text-slate-400 flex items-center gap-2">
              <span title="Discovered MCP tools">{mcpStatus?.discoveredCount ?? 0} Discovered</span>
              <span>•</span>
              <span className="text-emerald-400 font-semibold" title="Enabled Safe Tools">
                {mcpStatus?.enabledCount ?? 0} Enabled
              </span>
            </div>

            <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-transform" />
          </div>

          {/* Refresh Gateway Button */}
          <button
            onClick={handleRefreshMcp}
            disabled={refreshingMcp}
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all disabled:opacity-50"
            title="Reconnect & Refresh MCP Tools"
          >
            <RefreshCw className={`w-4 h-4 ${refreshingMcp ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* Connection Notice Banners if Requires Auth or Unavailable */}
      {mcpStatus?.status === 'requires_auth' && (
        <div className="bg-amber-950/40 border-b border-amber-800/40 px-4 py-2 flex items-center justify-between text-xs text-amber-200/90">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>The MCP service requires authentication.</strong> External tool calls will resume once server credentials are provided. Gemini is actively answering with core HR knowledge.
            </span>
          </div>
          <button
            onClick={() => setShowDiagnostics(true)}
            className="underline hover:text-amber-100 font-medium ml-3 shrink-0"
          >
            View Details
          </button>
        </div>
      )}

      {mcpStatus?.status === 'unavailable' && (
        <div className="bg-rose-950/40 border-b border-rose-800/40 px-4 py-2 flex items-center justify-between text-xs text-rose-200/90">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>The career-data MCP service is currently unavailable.</strong> CareerPilot is operating in standalone reasoning mode.
            </span>
          </div>
          <button
            onClick={handleRefreshMcp}
            className="underline hover:text-rose-100 font-medium ml-3 shrink-0"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 overflow-hidden flex relative">
        {/* VIEW 1: ASSISTANT CHAT */}
        {activeView === 'chat' && (
          <div className="flex-1 flex flex-col h-full bg-slate-950">
            {/* Quick Suggestions Bar */}
            <div className="px-4 py-2.5 bg-slate-900/50 border-b border-slate-800/60 overflow-x-auto flex items-center gap-2 text-xs no-scrollbar">
              <span className="text-slate-400 font-medium flex items-center gap-1 shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Suggestions:
              </span>
              {quickPrompts.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(item.query)}
                  className="px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/50 whitespace-nowrap transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Chat Messages Scrollable Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-3xl ${
                    msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white font-medium text-xs shadow-md ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-tr from-indigo-500 to-indigo-600'
                        : 'bg-gradient-to-tr from-slate-800 to-slate-700 border border-slate-700'
                    }`}
                  >
                    {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-indigo-300" />}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`group relative rounded-2xl p-4 text-sm leading-relaxed border transition-all ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white border-indigo-500/50 rounded-tr-sm shadow-md'
                        : 'bg-slate-900/90 text-slate-200 border-slate-800/80 rounded-tl-sm shadow-sm'
                    }`}
                  >
                    {/* Tool Invocation Badges */}
                    {msg.toolInvocations && msg.toolInvocations.length > 0 && (
                      <div className="mb-3 space-y-1.5 pb-2 border-b border-slate-800">
                        <div className="text-[11px] font-semibold tracking-wide text-indigo-400 uppercase flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5" />
                          <span>Executed MCP Tools ({msg.toolInvocations.length})</span>
                        </div>
                        {msg.toolInvocations.map((exec, i) => (
                          <div
                            key={i}
                            className="bg-slate-950/70 border border-slate-800 rounded-lg p-2 text-xs font-mono text-slate-300"
                          >
                            <div className="flex items-center justify-between text-indigo-300 font-semibold mb-1">
                              <span>⚙ {exec.name}</span>
                              <span className="text-[10px] text-slate-500">{new Date(exec.timestamp).toLocaleTimeString()}</span>
                            </div>
                            {exec.args && Object.keys(exec.args).length > 0 && (
                              <div className="text-[11px] text-slate-400 truncate">
                                Args: {JSON.stringify(exec.args)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Markdown-like Text Formatting */}
                    <div className="whitespace-pre-wrap space-y-2">
                      {msg.text.split('\n\n').map((paragraph, pIdx) => (
                        <p key={pIdx}>
                          {paragraph.split('**').map((part, bIdx) =>
                            bIdx % 2 === 1 ? <strong key={bIdx} className="font-semibold text-white">{part}</strong> : part
                          )}
                        </p>
                      ))}
                    </div>

                    {/* Footer / Copy Button */}
                    <div className="flex items-center justify-between mt-2 pt-2 text-[11px] text-slate-400/80 border-t border-white/5">
                      <span>{msg.timestamp}</span>
                      <button
                        onClick={() => copyToClipboard(msg.text, msg.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 hover:text-white"
                        title="Copy text"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex gap-3 max-w-xl mr-auto">
                  <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-indigo-400 animate-pulse" />
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-sm p-4 text-sm text-slate-400 flex items-center gap-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                    </div>
                    <span className="text-xs text-slate-400">Querying Gemini & inspecting MCP tools...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-4 bg-slate-900/70 border-t border-slate-800/80 backdrop-blur-sm">
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2 max-w-4xl mx-auto"
              >
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={e => setInputMessage(e.target.value)}
                    placeholder="Ask about jobs, resume tailoring, ATS evaluation, PM skills, or labor market statistics..."
                    disabled={sending}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all pr-10"
                  />
                  <span className="absolute right-3 top-3.5 text-xs text-slate-600">
                    ⌘ + Enter
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={!inputMessage.trim() || sending}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white font-medium p-3 rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
              <div className="text-[11px] text-slate-500 text-center mt-2 flex items-center justify-center gap-3">
                <span>Smithery Endpoint: <code className="text-slate-400 font-mono">mode=smart</code></span>
                <span>•</span>
                <span>Read-Only Safety Policy Enforced</span>
                <span>•</span>
                <span>Zero Client-Side Credentials</span>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: RESUME & MATCHER WORKSPACE */}
        {activeView === 'resume-matcher' && (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Resume & Job Description Analyzer</h2>
                  <p className="text-sm text-slate-400">
                    Evaluate compatibility, tailor experience bullets, and generate custom cover letters powered by Gemini.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setResumeText(`JOHN DOE
Senior Full-Stack Software Engineer
Contact: john.doe@email.com | github.com/johndoe | Singapore

SUMMARY:
Results-driven software engineer with 6+ years of experience designing high-scale React, TypeScript, and Node.js microservices. Proven success leading technical architecture, improving page load by 42%, and mentoring 8 junior developers.

EXPERIENCE:
Staff Software Engineer | FinTech Global (2022 - Present)
- Architected enterprise customer portal using React 18, Vite, TypeScript, and Tailwind CSS serving 1.5M monthly active users.
- Built automated CI/CD pipeline reducing release cycle times by 65%.
- Partnered with product and HR to define hiring rubrics and interview over 40 engineering candidates.

Software Engineer | CloudScale Systems (2019 - 2022)
- Developed RESTful and GraphQL backend microservices in Express, PostgreSQL, and Redis.
- Implemented real-time dashboard with WebSockets handling 10k concurrent active streams.`);
                      setJobDescription(`Senior React Engineer
Location: Singapore (Hybrid)
Company: TechCorp Innovations

RESPONSIBILITIES:
- Build next-generation web applications using React, TypeScript, and modern frontend tooling.
- Collaborate closely with Product Managers and Designers to iterate rapidly on user experience.
- Maintain high code quality, automated testing, and web performance standards.

REQUIREMENTS:
- 5+ years building production web apps with React & modern JavaScript/TypeScript.
- Strong knowledge of state management, responsive UI frameworks (Tailwind CSS), and web performance.
- Experience with full-stack Node.js or cloud services is a plus.
- Excellent communication and cross-functional leadership skills.`);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:text-white transition-colors"
                  >
                    Load Sample Data
                  </button>
                  <button
                    onClick={() => {
                      setResumeText('');
                      setJobDescription('');
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Side by side inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span>1. Candidate Resume</span>
                    <span className="text-[11px] text-slate-500 font-normal">{resumeText.length} characters</span>
                  </label>
                  <textarea
                    value={resumeText}
                    onChange={e => setResumeText(e.target.value)}
                    placeholder="Paste candidate resume or CV text here..."
                    rows={14}
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span>2. Target Job Description</span>
                    <span className="text-[11px] text-slate-500 font-normal">{jobDescription.length} characters</span>
                  </label>
                  <textarea
                    value={jobDescription}
                    onChange={e => setJobDescription(e.target.value)}
                    placeholder="Paste job posting, required qualifications, and duties here..."
                    rows={14}
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => triggerAnalyzeResume('compare')}
                  className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/80 to-slate-900 border border-indigo-700/40 hover:border-indigo-500 text-left transition-all group shadow-sm"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-sm text-indigo-300 group-hover:text-indigo-200 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      ATS Compatibility Match
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />
                  </div>
                  <p className="text-xs text-slate-400">
                    Calculate 1-100 fit score, key requirement matches, and missing qualifications.
                  </p>
                </button>

                <button
                  onClick={() => triggerAnalyzeResume('tailor')}
                  className="p-4 rounded-xl bg-gradient-to-r from-violet-950/80 to-slate-900 border border-violet-700/40 hover:border-violet-500 text-left transition-all group shadow-sm"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-sm text-violet-300 group-hover:text-violet-200 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-violet-400" />
                      Tailor Experience Bullets
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />
                  </div>
                  <p className="text-xs text-slate-400">
                    Re-align resume achievements to match target job keywords and expectations.
                  </p>
                </button>

                <button
                  onClick={() => triggerAnalyzeResume('coverletter')}
                  className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/80 to-slate-900 border border-emerald-700/40 hover:border-emerald-500 text-left transition-all group shadow-sm"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-sm text-emerald-300 group-hover:text-emerald-200 flex items-center gap-2">
                      <Award className="w-4 h-4 text-emerald-400" />
                      Generate Cover Letter
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />
                  </div>
                  <p className="text-xs text-slate-400">
                    Draft a customized, high-converting cover letter based on candidate strengths.
                  </p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: LABOR & SKILLS EXPLORER */}
        {activeView === 'labor-skills' && (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
            <div className="max-w-5xl mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Labor Market & Skill Taxonomy Navigator</h2>
                <p className="text-sm text-slate-400">
                  Ground career conversations in ILOSTAT, OECD market metrics, and standardized skill ontologies.
                </p>
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Labor Stats Card */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-3 text-indigo-400 font-semibold">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <span>Global & Regional Labor Statistics</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Retrieve employment ratios, youth unemployment, sector participation, and labor trends backed by international agencies like ILO and OECD.
                  </p>
                  <div className="space-y-2 pt-2">
                    {[
                      'What is the unemployment rate in Singapore?',
                      'Compare tech sector employment trends in OECD countries',
                      'What are the key labor statistics for Southeast Asia tech workers?'
                    ].map((query, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setActiveView('chat');
                          handleSendMessage(query);
                        }}
                        className="w-full text-left p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 flex items-center justify-between group transition-all"
                      >
                        <span className="truncate">{query}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 shrink-0 ml-2" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Skills Card */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-3 text-violet-400 font-semibold">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
                      <Award className="w-4 h-4" />
                    </div>
                    <span>Competency & Skill Frameworks</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Explore standardized frameworks such as pm-skills and skill-repo to guide progression from Associate to Principal roles.
                  </p>
                  <div className="space-y-2 pt-2">
                    {[
                      'What skills should a product manager develop?',
                      'List core competencies for an AI Product Manager',
                      'Provide engineering ladder skills from Mid-level to Staff'
                    ].map((query, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setActiveView('chat');
                          handleSendMessage(query);
                        }}
                        className="w-full text-left p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 flex items-center justify-between group transition-all"
                      >
                        <span className="truncate">{query}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-violet-400 shrink-0 ml-2" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status Note */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-start gap-3">
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-300">Dynamic Tool Dispatch: </span>
                  When tools from ILOSTAT, OECD, or skill taxonomies are exposed by the Smithery gateway, Gemini selects and queries them directly. In the event of gateway unavailability or authentication requirements, Gemini falls back to structured reasoning.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* DIAGNOSTIC MODAL & TOOL INSPECTOR */}
      {showDiagnostics && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-base">Smithery MCP Gateway Diagnostics</h3>
                  <p className="text-xs text-slate-400">
                    Discovered tools, safety allowlist evaluation, and live session telemetry
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDiagnostics(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Subheader summary stats */}
            <div className="px-6 py-3 bg-slate-950/80 border-b border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block">Gateway Status</span>
                <span className={`font-semibold capitalize ${
                  mcpStatus?.status === 'connected' ? 'text-emerald-400' :
                  mcpStatus?.status === 'requires_auth' ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  ● {mcpStatus?.status === 'requires_auth' ? 'Requires Auth' : (mcpStatus?.status || 'Disconnected')}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Discovered Tools</span>
                <span className="font-semibold text-slate-200">{mcpStatus?.discoveredCount ?? 0}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Enabled (Safe Read-Only)</span>
                <span className="font-semibold text-emerald-400">{mcpStatus?.enabledCount ?? 0}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Blocked (Side Effects)</span>
                <span className="font-semibold text-rose-400">{mcpStatus?.blockedCount ?? 0}</span>
              </div>
            </div>

            {/* Diagnostic Tabs */}
            <div className="px-6 pt-3 border-b border-slate-800 flex gap-4 text-xs font-medium">
              <button
                onClick={() => setDiagnosticTab('tools')}
                className={`pb-2 border-b-2 transition-colors ${
                  diagnosticTab === 'tools'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Discovered Tools ({mcpStatus?.discoveredCount ?? 0})
              </button>
              <button
                onClick={() => setDiagnosticTab('executions')}
                className={`pb-2 border-b-2 transition-colors ${
                  diagnosticTab === 'executions'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Tool Executions Log ({mcpStatus?.recentExecutions?.length ?? 0})
              </button>
              <button
                onClick={() => setDiagnosticTab('policy')}
                className={`pb-2 border-b-2 transition-colors ${
                  diagnosticTab === 'policy'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Safety & Filtering Rules
              </button>
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {diagnosticTab === 'tools' && (
                <div className="space-y-4">
                  {/* Search and Category Filter */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                      <input
                        type="text"
                        value={toolSearch}
                        onChange={e => setToolSearch(e.target.value)}
                        placeholder="Filter tools by name or description..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <select
                      value={toolCategoryFilter}
                      onChange={e => setToolCategoryFilter(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="all">All Categories</option>
                      <option value="enabled">Safe / Enabled Only</option>
                      <option value="blocked">Blocked Only</option>
                      <option value="search">Job Search</option>
                      <option value="analytics">Labor Stats</option>
                      <option value="skills">Skills Frameworks</option>
                      <option value="resume_analysis">Resume Analysis</option>
                    </select>
                  </div>

                  {/* Endpoint Information */}
                  <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Gateway URL:</span>
                    <code className="text-indigo-300 font-mono select-all">
                      {mcpStatus?.endpoint || 'https://mcp.smithery.ai/zhouwenwen0121?mode=smart'}
                    </code>
                  </div>

                  {/* Tools List */}
                  {filteredTools.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                      {filteredTools.map((tool, idx) => (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-xl border text-xs transition-all ${
                            tool.enabled
                              ? 'bg-slate-950/80 border-slate-800'
                              : 'bg-rose-950/20 border-rose-900/40'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-slate-100">{tool.name}</span>
                              <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 capitalize border border-slate-700">
                                {tool.category.replace('_', ' ')}
                              </span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1 ${
                                tool.enabled
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {tool.enabled ? (
                                <>
                                  <ShieldCheck className="w-3 h-3" /> Enabled
                                </>
                              ) : (
                                <>
                                  <ShieldAlert className="w-3 h-3" /> Blocked
                                </>
                              )}
                            </span>
                          </div>
                          <p className="text-slate-400 leading-relaxed mb-1">{tool.description}</p>
                          {tool.reason && (
                            <div className="text-[11px] text-rose-300/90 font-mono mt-1 pt-1 border-t border-rose-900/30">
                              Policy: {tool.reason}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl space-y-2">
                      <p>
                        {mcpStatus?.status === 'requires_auth'
                          ? 'The MCP service requires authentication.'
                          : mcpStatus?.status === 'unavailable'
                            ? 'The career-data MCP service is currently unavailable.'
                            : 'No tools discovered or matching current filter.'}
                      </p>
                      <button
                        onClick={handleRefreshMcp}
                        className="text-indigo-400 underline hover:text-indigo-300"
                      >
                        Try Reconnecting
                      </button>
                    </div>
                  )}
                </div>
              )}

              {diagnosticTab === 'executions' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">
                    Live execution log of tools called by Gemini during conversations with the assistant:
                  </p>
                  {mcpStatus?.recentExecutions && mcpStatus.recentExecutions.length > 0 ? (
                    mcpStatus.recentExecutions.map(item => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-2"
                      >
                        <div className="flex items-center justify-between text-indigo-300 font-semibold">
                          <span>⚙ {item.name}</span>
                          <span className="text-[10px] text-slate-500">{new Date(item.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="bg-slate-900/80 p-2 rounded border border-slate-800 text-slate-300">
                          <span className="text-slate-500 block text-[10px]">ARGUMENTS:</span>
                          <pre className="overflow-x-auto text-[11px]">{JSON.stringify(item.args, null, 2)}</pre>
                        </div>
                        {item.error ? (
                          <div className="text-rose-400 bg-rose-950/30 p-2 rounded border border-rose-900/50">
                            Error: {item.error}
                          </div>
                        ) : (
                          <div className="bg-slate-900/80 p-2 rounded border border-slate-800 text-slate-300">
                            <span className="text-slate-500 block text-[10px]">RESULT:</span>
                            <pre className="overflow-x-auto text-[11px]">
                              {JSON.stringify(item.result, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                      No tool executions recorded in this session yet. Ask Gemini a question about jobs, labor stats, or skills to trigger MCP tool invocation.
                    </div>
                  )}
                </div>
              )}

              {diagnosticTab === 'policy' && (
                <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <h4 className="font-semibold text-white flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      Read-Only Safety Guarantee
                    </h4>
                    <p className="text-slate-400">
                      All tools from external MCP gateways are treated as untrusted capabilities. The filtering layer in <code className="text-indigo-300">lib/mcp/toolFilter.ts</code> inspects both tool names and metadata.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-900/40 space-y-2">
                      <span className="font-semibold text-emerald-400 block">Allowed Capabilities (Read-Only & Local)</span>
                      <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                        <li>Job search and opening queries</li>
                        <li>Resume ATS evaluation and keyword scoring</li>
                        <li>Labor statistics and employment trend queries (ILOSTAT, OECD)</li>
                        <li>Standardized competency taxonomy navigation</li>
                        <li>Local content generation (resume tailoring, cover letters)</li>
                      </ul>
                    </div>

                    <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-900/40 space-y-2">
                      <span className="font-semibold text-rose-400 block">Blocked Capabilities (Side Effects)</span>
                      <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                        <li>Automatic job applying or submission (JobGPT AutoApply, etc.)</li>
                        <li>Sending emails, SMS, or private messages</li>
                        <li>Modifying or creating external accounts</li>
                        <li>Financial transactions, payments, or billing</li>
                        <li>Destructive deletion or database record mutations</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-950/50 text-xs">
              <span className="text-slate-500">
                Last checked: {mcpStatus?.lastChecked ? new Date(mcpStatus.lastChecked).toLocaleTimeString() : 'Never'}
              </span>
              <button
                onClick={() => setShowDiagnostics(false)}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

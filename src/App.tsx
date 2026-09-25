/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Briefcase,
  Search,
  Upload,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Download,
  Copy,
  Check,
  RefreshCw,
  ChevronRight,
  ArrowLeft,
  Building,
  MapPin,
  DollarSign,
  Clock,
  Layers,
  Edit3,
  ShieldCheck,
  ShieldAlert,
  Info
} from 'lucide-react';
import { jsPDF } from 'jspdf';

interface ParsedResume {
  name: string;
  location: string;
  professionalSummary: string;
  yearsOfExperience: string;
  jobTitles: string[];
  skills: string[];
  workExperience: Array<{
    role: string;
    company: string;
    duration?: string;
    highlights: string[];
  }>;
  education: Array<{
    degree: string;
    institution: string;
    year?: string;
  }>;
  certifications: string[];
  projects: string[];
  rawText: string;
}

interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  workArrangement?: 'Remote' | 'Hybrid' | 'On-site' | 'Not Specified';
  salary?: string;
  source: 'Indeed' | 'Glassdoor';
  description: string;
  responsibilities: string[];
  qualifications: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  url?: string;
}

interface JobMatchResult {
  job: JobListing;
  matchScore: number;
  scoreLabel: string;
  relevanceExplanation: string;
  matchingSkills: string[];
  missingRequirements: string[];
  unclearRequirements: string[];
}

interface PolishRecommendation {
  requirement: string;
  resumeEvidence: string;
  recommendation: string;
}

interface PolishedResumeResult {
  jobTitle: string;
  company: string;
  recommendations: PolishRecommendation[];
  summaryOfChanges: string[];
  polishedResumeText: string;
}

interface McpServerStatus {
  name: 'Indeed' | 'Glassdoor';
  status: 'connected' | 'unavailable';
  message: string;
  discoveredCount: number;
  enabledCount: number;
}

interface McpSystemStatus {
  hasApiKey: boolean;
  configError?: string;
  indeed: McpServerStatus;
  glassdoor: McpServerStatus;
  overall: 'connected' | 'partial' | 'unavailable';
  overallMessage: string;
}

export default function App() {
  // Navigation: strictly "My Resume" and "Matched Jobs"
  const [activeTab, setActiveTab] = useState<'my-resume' | 'matched-jobs'>('my-resume');

  // MCP Gateway Status
  const [mcpStatus, setMcpStatus] = useState<McpSystemStatus | null>(null);
  const [isRefreshingMcp, setIsRefreshingMcp] = useState<boolean>(false);

  // Resume State
  const [rawResumeText, setRawResumeText] = useState<string>('');
  const [parsedResume, setParsedResume] = useState<ParsedResume | null>(null);
  const [isAnalyzingResume, setIsAnalyzingResume] = useState<boolean>(false);
  const [resumeUploaded, setResumeUploaded] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Job Search State
  const [searchTitle, setSearchTitle] = useState<string>('');
  const [searchLocation, setSearchLocation] = useState<string>('');
  const [searchKeywords, setSearchKeywords] = useState<string>('');
  const [searchArrangement, setSearchArrangement] = useState<string>('Any');
  const [isSearchingJobs, setIsSearchingJobs] = useState<boolean>(false);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // Job Detail & Matching State
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const [jobMatchResult, setJobMatchResult] = useState<JobMatchResult | null>(null);
  const [isMatchingResume, setIsMatchingResume] = useState<boolean>(false);

  // Resume Polishing State
  const [isPolishingResume, setIsPolishingResume] = useState<boolean>(false);
  const [polishResult, setPolishResult] = useState<PolishedResumeResult | null>(null);
  const [editableResume, setEditableResume] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Sub-view inside Matched Jobs: 'list' | 'details' | 'polish'
  const [jobsSubView, setJobsSubView] = useState<'list' | 'details' | 'polish'>('list');

  // Fetch MCP status on mount
  useEffect(() => {
    fetchMcpStatus();
  }, []);

  const fetchMcpStatus = async () => {
    try {
      const res = await fetch('/api/mcp/status');
      if (res.ok) {
        const data = await res.json();
        setMcpStatus(data);
      }
    } catch (e) {
      console.error('Failed to fetch MCP status', e);
    }
  };

  const handleRefreshMcp = async () => {
    setIsRefreshingMcp(true);
    try {
      const res = await fetch('/api/mcp/refresh', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setMcpStatus(data);
      }
    } catch (e) {
      console.error('Failed to refresh MCP', e);
    } finally {
      setIsRefreshingMcp(false);
    }
  };

  // Handle Resume File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawResumeText(content);
        setResumeUploaded(true);
        triggerAnalyzeResume(content);
      }
    };
    reader.readAsText(file);
  };

  const triggerAnalyzeResume = async (textToAnalyze: string) => {
    if (!textToAnalyze.trim()) return;
    setIsAnalyzingResume(true);
    try {
      const res = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText: textToAnalyze }),
      });
      if (res.ok) {
        const data: ParsedResume = await res.json();
        setParsedResume(data);
        setResumeUploaded(true);
        // Prepopulate search criteria from parsed resume
        if (data.jobTitles && data.jobTitles.length > 0 && !searchTitle) {
          setSearchTitle(data.jobTitles[0]);
        }
        if (data.location && !searchLocation) {
          setSearchLocation(data.location);
        }
      }
    } catch (err) {
      console.error('Failed to parse resume', err);
    } finally {
      setIsAnalyzingResume(false);
    }
  };

  const handleUseSampleResume = () => {
    const sample = `Alex Rivera
Senior Frontend & Full-Stack Engineer
alex.rivera.dev@gmail.com | Singapore | linkedin.com/in/alexrivera

PROFESSIONAL SUMMARY
Dynamic Software Engineer with 6+ years of production experience building high-performance web applications with React, TypeScript, and modern cloud technologies. Proven track record leading frontend architecture, driving 40% performance gains, and mentoring engineering team members.

WORK EXPERIENCE
Senior Frontend Engineer | TechStream Solutions (2022 - Present)
- Led frontend re-architecture of cloud customer portal using React 18, TypeScript, and Tailwind CSS serving 800,000 monthly active users.
- Reduced initial bundle size by 45% and improved Core Web Vitals (LCP) from 3.8s to 1.4s.
- Collaborated closely with Product Managers and UX designers to design intuitive customer analytics dashboards.

Software Engineer | Apex Digital (2019 - 2022)
- Built interactive single-page applications and RESTful backend microservices in Node.js and Express.
- Engineered automated CI/CD pipelines reducing release turnaround time from 2 days to under 30 minutes.
- Maintained 90%+ unit and end-to-end testing coverage using Jest and Playwright.

TECHNICAL SKILLS
Languages: TypeScript, JavaScript (ESNext), Python, HTML5, CSS3/Tailwind
Frontend: React, Next.js, Redux Toolkit, Vite, WebSockets, Responsive UI
Backend & Cloud: Node.js, Express, PostgreSQL, REST APIs, AWS (S3, CloudFront)
Tools: Git, Docker, Jest, CI/CD, Agile/Scrum

EDUCATION
Bachelor of Science in Computer Science
National University of Singapore (2015 - 2019)`;

    setRawResumeText(sample);
    setResumeUploaded(true);
    triggerAnalyzeResume(sample);
  };

  // Job Search
  const handleSearchJobs = async () => {
    setIsSearchingJobs(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const res = await fetch('/api/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          desiredJobTitle: searchTitle || (parsedResume?.jobTitles?.[0]) || 'Software Engineer',
          preferredLocation: searchLocation || parsedResume?.location || 'Singapore',
          keywords: searchKeywords,
          arrangement: searchArrangement,
          resumeSkills: parsedResume?.skills || [],
          resumeJobTitles: parsedResume?.jobTitles || [],
        }),
      });

      const data = await res.json();
      if (data.jobs && data.jobs.length > 0) {
        setJobs(data.jobs);
        setSearchError(null);
      } else {
        setJobs([]);
        // Strictly use the truthful upstream error messages
        if (data.error) {
          setSearchError(data.error);
        } else if (data.indeedStatus !== 'Connected' && data.glassdoorStatus !== 'Connected') {
          setSearchError('Job search is currently unavailable. Please try again later.');
        } else if (data.indeedStatus !== 'Connected') {
          setSearchError('Indeed job search is currently unavailable. No matching listings found on Glassdoor.');
        } else if (data.glassdoorStatus !== 'Connected') {
          setSearchError('Glassdoor job search is currently unavailable. No matching listings found on Indeed.');
        } else {
          setSearchError('No matching job listings found for the specified criteria.');
        }
      }
    } catch {
      setJobs([]);
      setSearchError('Job search is currently unavailable. Please try again later.');
    } finally {
      setIsSearchingJobs(false);
      setActiveTab('matched-jobs');
      setJobsSubView('list');
    }
  };

  // Match Resume to Job
  const handleSelectJobForMatching = async (job: JobListing) => {
    setSelectedJob(job);
    setIsMatchingResume(true);
    setJobsSubView('details');

    try {
      const res = await fetch('/api/resume/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: parsedResume || rawResumeText,
          job,
        }),
      });

      if (res.ok) {
        const matchData: JobMatchResult = await res.json();
        setJobMatchResult(matchData);
      }
    } catch (err) {
      console.error('Failed to match resume to job', err);
    } finally {
      setIsMatchingResume(false);
    }
  };

  // Polish Resume specifically for this job
  const handlePolishResume = async () => {
    if (!selectedJob) return;
    setIsPolishingResume(true);
    setJobsSubView('polish');

    try {
      const res = await fetch('/api/resume/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: parsedResume || rawResumeText,
          job: selectedJob,
        }),
      });

      if (res.ok) {
        const data: PolishedResumeResult = await res.json();
        setPolishResult(data);
        setEditableResume(data.polishedResumeText);
      }
    } catch (err) {
      console.error('Failed to polish resume', err);
    } finally {
      setIsPolishingResume(false);
    }
  };

  // Copy polished resume
  const handleCopyResume = () => {
    navigator.clipboard.writeText(editableResume);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download PDF
  const handleDownloadPdf = () => {
    if (!editableResume) return;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'letter',
    });

    const margin = 45;
    const pageWidth = doc.internal.pageSize.getWidth();
    const maxLineWidth = pageWidth - margin * 2;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10.5);

    const lines = doc.splitTextToSize(editableResume, maxLineWidth);
    let cursorY = 50;
    const lineHeight = 15;

    for (let i = 0; i < lines.length; i++) {
      if (cursorY + lineHeight > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        cursorY = margin;
      }
      const line = lines[i];
      if (line.startsWith('# ')) {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(15);
        doc.text(line.replace(/^#\s*/, ''), margin, cursorY);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(10.5);
        cursorY += lineHeight + 5;
      } else if (line.startsWith('## ')) {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(12);
        cursorY += 4;
        doc.text(line.replace(/^##\s*/, ''), margin, cursorY);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(10.5);
        cursorY += lineHeight + 2;
      } else {
        doc.text(line, margin, cursorY);
        cursorY += lineHeight;
      }
    }

    const filename = `${(selectedJob?.title || 'tailored').replace(/[^a-zA-Z0-9_-]/g, '_')}_resume.pdf`;
    doc.save(filename);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Header & Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-3 shrink-0 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
            <Briefcase className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight leading-none">JobSeeker AI</h1>
            <p className="text-[11px] text-slate-400">Indeed & Glassdoor Job Matching</p>
          </div>
        </div>

        {/* Navigation containing ONLY "My Resume" and "Matched Jobs" */}
        <nav className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs font-medium">
          <button
            onClick={() => setActiveTab('my-resume')}
            className={`px-4 py-1.5 rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'my-resume'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>My Resume</span>
            {resumeUploaded && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
          </button>
          <button
            onClick={() => setActiveTab('matched-jobs')}
            className={`px-4 py-1.5 rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'matched-jobs'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Matched Jobs</span>
            {jobs.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono">
                {jobs.length}
              </span>
            )}
          </button>
        </nav>

        {/* Small MCP Status Indicator */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
            {/* Indeed MCP Status */}
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  mcpStatus?.indeed.status === 'connected' ? 'bg-emerald-400' : 'bg-rose-500'
                }`}
              ></span>
              <span className="text-slate-300 font-medium">Indeed MCP:</span>
              <span className={mcpStatus?.indeed.status === 'connected' ? 'text-emerald-400' : 'text-slate-400'}>
                {mcpStatus?.indeed.status === 'connected'
                  ? `Connected (${mcpStatus.indeed.enabledCount} tools)`
                  : 'Unavailable'}
              </span>
            </div>

            <div className="h-3 w-px bg-slate-700"></div>

            {/* Glassdoor MCP Status */}
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  mcpStatus?.glassdoor.status === 'connected' ? 'bg-emerald-400' : 'bg-rose-500'
                }`}
              ></span>
              <span className="text-slate-300 font-medium">Glassdoor MCP:</span>
              <span className={mcpStatus?.glassdoor.status === 'connected' ? 'text-emerald-400' : 'text-slate-400'}>
                {mcpStatus?.glassdoor.status === 'connected'
                  ? `Connected (${mcpStatus.glassdoor.enabledCount} tools)`
                  : 'Unavailable'}
              </span>
            </div>
          </div>

          <button
            onClick={handleRefreshMcp}
            disabled={isRefreshingMcp}
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition-all disabled:opacity-50"
            title="Refresh MCP Gateway Connections"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingMcp ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col max-w-6xl w-full mx-auto p-6 space-y-6">
        {/* Server Configuration Error Notice when HASDATA_API_KEY is missing */}
        {mcpStatus && !mcpStatus.hasApiKey && (
          <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex items-start gap-3 shadow-sm">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-amber-300">Server Configuration Required: HASDATA_API_KEY</span>
                <span className="px-2 py-0.5 rounded bg-amber-900/60 border border-amber-700/50 text-[10px] font-mono text-amber-200">
                  server-side only
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                {mcpStatus.configError ||
                  'HASDATA_API_KEY is not configured in server environment variables. When running locally or in Vercel, set HASDATA_API_KEY in your server environment settings to connect to Indeed and Glassdoor MCP servers. Mock or fallback job data is disabled.'}
              </p>
            </div>
          </div>
        )}

        {/* TAB 1: MY RESUME */}
        {activeTab === 'my-resume' && (
          <div className="space-y-6">
            {!resumeUploaded ? (
              /* HOME SCREEN (No Resume Uploaded Yet) */
              <div className="text-center py-12 px-4 max-w-2xl mx-auto space-y-6">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
                  <FileText className="w-7 h-7" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-extrabold text-white tracking-tight">Find jobs that fit you.</h2>
                  <p className="text-slate-400 text-sm leading-relaxed max-w-xl mx-auto">
                    Upload your resume and we'll find relevant jobs from Indeed and Glassdoor, then help tailor your
                    resume to the job you want.
                  </p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".txt,.pdf,.doc,.docx"
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAnalyzingResume}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload Resume</span>
                  </button>
                  <button
                    onClick={handleUseSampleResume}
                    disabled={isAnalyzingResume}
                    className="w-full sm:w-auto px-5 py-3 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-all"
                  >
                    Use Sample Resume
                  </button>
                </div>

                {/* Paste Text Option */}
                <div className="pt-6 border-t border-slate-800 text-left">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Or paste your resume text:
                  </label>
                  <textarea
                    rows={6}
                    value={rawResumeText}
                    onChange={(e) => setRawResumeText(e.target.value)}
                    placeholder="Paste your work experience, skills, and education here..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => triggerAnalyzeResume(rawResumeText)}
                      disabled={!rawResumeText.trim() || isAnalyzingResume}
                      className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-all disabled:opacity-50"
                    >
                      {isAnalyzingResume ? 'Analyzing Resume...' : 'Analyze Pasted Resume'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* RESUME UPLOADED VIEW */
              <div className="space-y-6">
                {/* Upload Status Banner */}
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white">Resume uploaded ✓</span>
                        {parsedResume?.name && (
                          <span className="text-xs text-slate-400">({parsedResume.name})</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        Extracted {parsedResume?.skills?.length || 0} skills,{' '}
                        {parsedResume?.workExperience?.length || 0} work experiences.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setResumeUploaded(false);
                        setParsedResume(null);
                        setRawResumeText('');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      Change Resume
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('matched-jobs');
                        if (!hasSearched) handleSearchJobs();
                      }}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm transition-all flex items-center gap-1.5"
                    >
                      <span>Find Matching Jobs</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Parsed Resume Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Left Column: Summary & Skills */}
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Extracted Profile
                      </h3>
                      <div>
                        <span className="text-xs text-slate-500">Name:</span>
                        <p className="text-sm font-semibold text-white">{parsedResume?.name || 'Not Specified'}</p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Location:</span>
                        <p className="text-sm text-slate-200">{parsedResume?.location || 'Not Specified'}</p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Years of Experience:</span>
                        <p className="text-sm text-slate-200">{parsedResume?.yearsOfExperience || 'Not Specified'}</p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Identified Skills ({parsedResume?.skills?.length || 0})
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {parsedResume?.skills?.map((skill, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-xs text-slate-300 font-mono"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Middle / Right: Work Experience & Summary */}
                  <div className="md:col-span-2 space-y-4">
                    {parsedResume?.professionalSummary && (
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Professional Summary
                        </h3>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {parsedResume.professionalSummary}
                        </p>
                      </div>
                    )}

                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Work Experience
                      </h3>
                      {parsedResume?.workExperience && parsedResume.workExperience.length > 0 ? (
                        <div className="space-y-4">
                          {parsedResume.workExperience.map((exp, idx) => (
                            <div key={idx} className="border-l-2 border-indigo-500/40 pl-3 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-sm text-white">{exp.role}</span>
                                <span className="text-xs text-slate-500">{exp.duration}</span>
                              </div>
                              <div className="text-xs text-indigo-400 font-medium">{exp.company}</div>
                              {exp.highlights && exp.highlights.length > 0 && (
                                <ul className="list-disc list-inside text-xs text-slate-400 space-y-1 pt-1">
                                  {exp.highlights.map((h, hIdx) => (
                                    <li key={hIdx} className="leading-relaxed">
                                      {h}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">No structured roles extracted.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MATCHED JOBS */}
        {activeTab === 'matched-jobs' && (
          <div className="space-y-6">
            {/* SUB-VIEW 1: JOB SEARCH & RESULTS LIST */}
            {jobsSubView === 'list' && (
              <div className="space-y-6">
                {/* Search & Filter Header Bar */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-white tracking-tight">Matched Jobs</h2>
                      <p className="text-xs text-slate-400">
                        Find openings matching your resume across Indeed and Glassdoor.
                      </p>
                    </div>

                    <button
                      onClick={handleSearchJobs}
                      disabled={isSearchingJobs}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2"
                    >
                      <Search className={`w-3.5 h-3.5 ${isSearchingJobs ? 'animate-spin' : ''}`} />
                      <span>{isSearchingJobs ? 'Searching Indeed & Glassdoor...' : 'Search Jobs'}</span>
                    </button>
                  </div>

                  {/* Filter Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 block mb-1">Desired Job Title</label>
                      <input
                        type="text"
                        value={searchTitle}
                        onChange={(e) => setSearchTitle(e.target.value)}
                        placeholder="e.g. Senior Frontend Engineer"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 block mb-1">Location</label>
                      <input
                        type="text"
                        value={searchLocation}
                        onChange={(e) => setSearchLocation(e.target.value)}
                        placeholder="e.g. Singapore, Remote"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 block mb-1">Keywords / Skills</label>
                      <input
                        type="text"
                        value={searchKeywords}
                        onChange={(e) => setSearchKeywords(e.target.value)}
                        placeholder="e.g. React, TypeScript, AWS"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 block mb-1">Work Arrangement</label>
                      <select
                        value={searchArrangement}
                        onChange={(e) => setSearchArrangement(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Any">Any Arrangement</option>
                        <option value="Remote">Remote</option>
                        <option value="Hybrid">Hybrid</option>
                        <option value="On-site">On-site</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Search Error / Status Banner */}
                {searchError && (
                  <div
                    className={`p-4 rounded-xl border text-xs flex items-start gap-3 ${
                      searchError.includes('Configuration Error') || searchError.includes('HASDATA_API_KEY')
                        ? 'bg-rose-950/40 border-rose-800/60 text-rose-200'
                        : 'bg-slate-900 border-amber-900/40 text-amber-300'
                    }`}
                  >
                    <AlertCircle
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        searchError.includes('Configuration Error') || searchError.includes('HASDATA_API_KEY')
                          ? 'text-rose-400'
                          : 'text-amber-400'
                      }`}
                    />
                    <div className="space-y-1">
                      <p className="font-semibold text-white">{searchError}</p>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {searchError.includes('Configuration Error') || searchError.includes('HASDATA_API_KEY')
                          ? 'Configure HASDATA_API_KEY in your server environment variables (e.g. Vercel Project Settings > Environment Variables) to enable live job discovery. The application strictly avoids generating mock or fallback job data.'
                          : 'The system queries real live MCP endpoints (Indeed & Glassdoor) without generating fake sample listings.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Job Cards List */}
                {jobs.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {jobs.map((job) => (
                      <div
                        key={job.id}
                        className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-base text-white hover:text-indigo-300 transition-colors">
                                {job.title}
                              </h3>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                  job.source === 'Indeed'
                                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                }`}
                              >
                                Source: {job.source}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
                              <span className="font-medium text-slate-300 flex items-center gap-1">
                                <Building className="w-3.5 h-3.5 text-slate-500" />
                                {job.company}
                              </span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                                {job.location}
                              </span>
                              {job.workArrangement && job.workArrangement !== 'Not Specified' && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1 text-indigo-300">
                                    <Clock className="w-3.5 h-3.5" />
                                    {job.workArrangement}
                                  </span>
                                </>
                              )}
                              {job.salary && job.salary !== 'Not Disclosed' && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1 text-emerald-400 font-mono">
                                    <DollarSign className="w-3.5 h-3.5" />
                                    {job.salary}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedJob(job);
                                setJobsSubView('details');
                                handleSelectJobForMatching(job);
                              }}
                              className="px-3.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
                            >
                              View Job
                            </button>
                            <button
                              onClick={() => handleSelectJobForMatching(job)}
                              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm transition-all flex items-center gap-1.5"
                            >
                              <Sparkles className="w-3 h-3 text-indigo-200" />
                              <span>Match Resume</span>
                            </button>
                          </div>
                        </div>

                        {/* Skills Preview */}
                        {job.requiredSkills && job.requiredSkills.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {job.requiredSkills.slice(0, 6).map((skill, sIdx) => (
                              <span
                                key={sIdx}
                                className="px-2 py-0.5 rounded text-[11px] bg-slate-950 text-slate-300 border border-slate-800"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  !isSearchingJobs &&
                  hasSearched && (
                    <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl space-y-3">
                      <Briefcase className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-sm text-slate-400">
                        {searchError || 'No live jobs retrieved. You can adjust your job title or location criteria.'}
                      </p>
                    </div>
                  )
                )}
              </div>
            )}

            {/* SUB-VIEW 2: JOB DETAILS & RESUME MATCHING */}
            {jobsSubView === 'details' && selectedJob && (
              <div className="space-y-6">
                {/* Back Link */}
                <button
                  onClick={() => setJobsSubView('list')}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Matched Jobs</span>
                </button>

                {/* Job Header Card */}
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-white tracking-tight">{selectedJob.title}</h2>
                        <span
                          className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                            selectedJob.source === 'Indeed'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          }`}
                        >
                          Source: {selectedJob.source}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
                        <span className="font-semibold text-slate-200">{selectedJob.company}</span>
                        <span>•</span>
                        <span>{selectedJob.location}</span>
                        {selectedJob.workArrangement && <span>• {selectedJob.workArrangement}</span>}
                        {selectedJob.salary && selectedJob.salary !== 'Not Disclosed' && (
                          <span className="text-emerald-400 font-mono">• {selectedJob.salary}</span>
                        )}
                        {selectedJob.url && (
                          <a
                            href={selectedJob.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:underline flex items-center gap-1"
                          >
                            <span>Original Listing</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Primary Action Button */}
                    <button
                      onClick={handlePolishResume}
                      disabled={isPolishingResume}
                      className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4 text-indigo-200" />
                      <span>Polish My Resume For This Job</span>
                    </button>
                  </div>

                  {/* AI Resume Match Section */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-indigo-950/60 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                          Resume Alignment Analysis
                        </span>
                        <span className="text-[10px] text-slate-500">(AI-generated estimate)</span>
                      </div>
                      {jobMatchResult && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-lg font-bold text-emerald-400 font-mono">
                            {jobMatchResult.matchScore}%
                          </span>
                          <span className="text-[11px] text-slate-400">Estimated Match</span>
                        </div>
                      )}
                    </div>

                    {isMatchingResume ? (
                      <p className="text-xs text-slate-400 animate-pulse">
                        Comparing your resume with job requirements...
                      </p>
                    ) : jobMatchResult ? (
                      <div className="space-y-3">
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {jobMatchResult.relevanceExplanation}
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          {/* Matching Skills */}
                          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                            <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" />
                              Matching Skills ({jobMatchResult.matchingSkills.length})
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {jobMatchResult.matchingSkills.map((s, idx) => (
                                <span
                                  key={idx}
                                  className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-800/40"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Missing / Unclear Requirements */}
                          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                            <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                              <Info className="w-3.5 h-3.5" />
                              Areas to Clarify ({jobMatchResult.missingRequirements.length})
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {jobMatchResult.missingRequirements.map((r, idx) => (
                                <span
                                  key={idx}
                                  className="text-[10px] px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-800/40"
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Job Description Text */}
                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Job Description</h3>
                    <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-950/60 p-4 rounded-xl border border-slate-800 max-h-96 overflow-y-auto">
                      {selectedJob.description}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-VIEW 3: RESUME POLISHING & DOWNLOAD WORKSPACE */}
            {jobsSubView === 'polish' && selectedJob && (
              <div className="space-y-6">
                {/* Back button */}
                <button
                  onClick={() => setJobsSubView('details')}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Job Details</span>
                </button>

                <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">
                      Polished Resume for {selectedJob.title}
                    </h2>
                    <p className="text-xs text-slate-400">
                      Tailored specifically against {selectedJob.company}'s requirements without inventing any facts.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyResume}
                      className="px-3.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors flex items-center gap-1.5"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleDownloadPdf}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm transition-all flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>
                  </div>
                </div>

                {isPolishingResume ? (
                  <div className="p-16 text-center border border-dashed border-slate-800 rounded-2xl space-y-3">
                    <Sparkles className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
                    <p className="text-sm text-slate-300 font-medium">Polishing resume with Gemini...</p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Emphasizing relevant experiences and truthful keywords while adhering strictly to your actual background.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Suggested Changes / Recommendations */}
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Suggested Modifications
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          How your existing background was mapped to target job requirements:
                        </p>

                        <div className="space-y-3">
                          {polishResult?.recommendations && polishResult.recommendations.length > 0 ? (
                            polishResult.recommendations.map((rec, i) => (
                              <div
                                key={i}
                                className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1.5"
                              >
                                <div className="text-slate-400 text-[10px] uppercase font-semibold">
                                  Job Requirement:
                                </div>
                                <div className="text-slate-200 font-medium">{rec.requirement}</div>

                                <div className="text-slate-400 text-[10px] uppercase font-semibold pt-1">
                                  Your Resume:
                                </div>
                                <div className="text-slate-300 text-[11px] italic">{rec.resumeEvidence}</div>

                                <div className="text-indigo-400 text-[10px] uppercase font-semibold pt-1">
                                  Recommendation:
                                </div>
                                <div className="text-indigo-200 text-[11px]">{rec.recommendation}</div>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-500">No specific change annotations provided.</p>
                          )}
                        </div>
                      </div>

                      {polishResult?.summaryOfChanges && (
                        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Enhancements Made
                          </h4>
                          <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                            {polishResult.summaryOfChanges.map((change, idx) => (
                              <li key={idx} className="leading-relaxed">
                                {change}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Right: Editable Polished Resume */}
                    <div className="lg:col-span-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editable Resume Draft</span>
                        </label>
                        <span className="text-[11px] text-slate-500">
                          Edit directly before downloading as PDF or copying
                        </span>
                      </div>
                      <textarea
                        rows={22}
                        value={editableResume}
                        onChange={(e) => setEditableResume(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 leading-relaxed placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 px-6 py-4 text-center text-xs text-slate-500 bg-slate-950 shrink-0">
        <p>JobSeeker AI — Focused Job Search & Resume Polishing for Individual Candidates.</p>
        <p className="text-[11px] text-slate-600 mt-1">
          Zero automated submissions • Read-only external job discovery • Honest resume representation
        </p>
      </footer>
    </div>
  );
}

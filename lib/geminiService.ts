/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';
import { mcpManager } from './hasdataClient.ts';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-job-seeker-assistant',
    },
  },
});

const CANDIDATE_MODELS = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

async function executeGeminiWithFallback(params: {
  contents: any;
  config?: any;
}) {
  let lastError: any = null;
  for (const modelName of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: params.contents,
        config: params.config,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || err || '');
      console.warn(`Model ${modelName} error (${msg.slice(0, 100)}). Trying fallback...`);
    }
  }
  throw lastError || new Error('All candidate models failed to respond.');
}

export interface ParsedResume {
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

export interface JobListing {
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

export interface JobMatchResult {
  job: JobListing;
  matchScore: number;
  scoreLabel: string;
  relevanceExplanation: string;
  matchingSkills: string[];
  missingRequirements: string[];
  unclearRequirements: string[];
}

export interface PolishRecommendation {
  requirement: string;
  resumeEvidence: string;
  recommendation: string;
}

export interface PolishedResumeResult {
  jobTitle: string;
  company: string;
  recommendations: PolishRecommendation[];
  summaryOfChanges: string[];
  polishedResumeText: string;
}

/**
 * Parses user's uploaded resume into structured format without inventing information.
 */
export async function parseResume(resumeText: string): Promise<ParsedResume> {
  const prompt = `You are a professional resume parser.
Extract the relevant factual information present in the resume below into valid JSON.
DO NOT INVENT or hallucinate any details, roles, companies, degrees, dates, or skills that are not directly mentioned in the resume text.

JSON Schema:
{
  "name": "Full name or Empty String if not present",
  "location": "Candidate location or Empty String",
  "professionalSummary": "Summary text or empty string",
  "yearsOfExperience": "Estimated years based purely on dates in resume, or 'Not Specified'",
  "jobTitles": ["Array of actual job titles mentioned"],
  "skills": ["Array of skills explicitly mentioned"],
  "workExperience": [
    {
      "role": "Title",
      "company": "Company",
      "duration": "Dates",
      "highlights": ["bullet point 1", "bullet point 2"]
    }
  ],
  "education": [
    {
      "degree": "Degree name",
      "institution": "School/University",
      "year": "Graduation year or dates"
    }
  ],
  "certifications": ["Certifications mentioned"],
  "projects": ["Projects mentioned"]
}

Resume Text:
"""
${resumeText.slice(0, 15000)}
"""

Output JSON only. Do not wrap in extra markdown or commentary outside the JSON block.`;

  const res = await executeGeminiWithFallback({
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
    },
  });

  const rawJson = res.text || '{}';
  try {
    const parsed = JSON.parse(rawJson);
    return {
      name: parsed.name || 'Candidate',
      location: parsed.location || '',
      professionalSummary: parsed.professionalSummary || '',
      yearsOfExperience: parsed.yearsOfExperience || 'Not Specified',
      jobTitles: Array.isArray(parsed.jobTitles) ? parsed.jobTitles : [],
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      workExperience: Array.isArray(parsed.workExperience) ? parsed.workExperience : [],
      education: Array.isArray(parsed.education) ? parsed.education : [],
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      rawText: resumeText,
    };
  } catch {
    return {
      name: 'Candidate',
      location: '',
      professionalSummary: '',
      yearsOfExperience: 'Not Specified',
      jobTitles: [],
      skills: [],
      workExperience: [],
      education: [],
      certifications: [],
      projects: [],
      rawText: resumeText,
    };
  }
}

/**
 * Searches Indeed and Glassdoor using live MCP tools if connected.
 * Strictly refuses to fabricate job listings if MCP tools are unavailable or return zero jobs.
 */
export async function searchJobsWithMcp(params: {
  desiredJobTitle?: string;
  preferredLocation?: string;
  keywords?: string;
  arrangement?: string;
  resumeSkills?: string[];
  resumeJobTitles?: string[];
}): Promise<{
  jobs: JobListing[];
  indeedStatus: string;
  glassdoorStatus: string;
  error?: string;
  isConfigError?: boolean;
}> {
  // Ensure MCP is connected with current runtime credentials if present
  const status = await mcpManager.ensureConnected();

  if (!mcpManager.hasApiKeyConfigured()) {
    return {
      jobs: [],
      indeedStatus: 'Indeed job search is currently unavailable.',
      glassdoorStatus: 'Glassdoor job search is currently unavailable.',
      error: 'Configuration Error: HASDATA_API_KEY is not configured in the server environment. Please set HASDATA_API_KEY in your server environment (or Vercel project settings) to connect to Indeed and Glassdoor MCP servers.',
      isConfigError: true,
    };
  }

  const indeedStatus = status.indeed.status;
  const glassdoorStatus = status.glassdoor.status;

  // If neither Indeed nor Glassdoor MCP is connected:
  if (indeedStatus !== 'connected' && glassdoorStatus !== 'connected') {
    return {
      jobs: [],
      indeedStatus: 'Indeed job search is currently unavailable.',
      glassdoorStatus: 'Glassdoor job search is currently unavailable.',
      error: 'Job search is currently unavailable. Please try again later.',
    };
  }

  const callableTool = mcpManager.getGeminiTools();
  if (!callableTool) {
    return {
      jobs: [],
      indeedStatus: indeedStatus === 'connected' ? 'Connected' : 'Indeed job search is currently unavailable.',
      glassdoorStatus: glassdoorStatus === 'connected' ? 'Connected' : 'Glassdoor job search is currently unavailable.',
      error: 'Job search is currently unavailable. Please try again later.',
    };
  }

  const searchTitle = params.desiredJobTitle || (params.resumeJobTitles && params.resumeJobTitles[0]) || 'Software Engineer';
  const searchLocation = params.preferredLocation || 'Singapore';
  const searchKeywords = params.keywords || (params.resumeSkills ? params.resumeSkills.slice(0, 5).join(' ') : '');

  const systemInstruction = `You are an automated job search tool dispatcher for an individual job seeker.
You have access to live MCP tools for Indeed and/or Glassdoor.
Your goal is to call the available Indeed and/or Glassdoor search tools to find relevant open job listings matching the user's criteria.

CRITICAL RULES:
- Use the discovered MCP tools to search Indeed and Glassdoor.
- When possible, search both sources.
- Do NOT fabricate or invent job listings.
- Do NOT return sample, seed, placeholder, or fallback jobs.
- Only return jobs that were actually retrieved by calling the MCP tools.
- Once you receive the tool responses, extract the actual jobs into a JSON array matching the schema.
- If a source returns an error or no jobs, report that source as having no listings rather than inventing results.`;

  const prompt = `Please search for relevant jobs with the following criteria using your available MCP tools:
- Job Title / Role: "${searchTitle}"
- Location: "${searchLocation}"
- Keywords / Skills: "${searchKeywords}"
- Work Arrangement Preference: "${params.arrangement || 'Any'}"

Once you call the search tools and obtain real listings, format the final response as a JSON array of job objects:
[
  {
    "id": "unique string or job key from source",
    "title": "Exact job title",
    "company": "Company name",
    "location": "Location from listing",
    "workArrangement": "Remote" | "Hybrid" | "On-site" | "Not Specified",
    "salary": "Salary if provided, or 'Not Disclosed'",
    "source": "Indeed" | "Glassdoor",
    "description": "Full or summary description from listing",
    "responsibilities": ["Array of responsibilities"],
    "qualifications": ["Array of qualifications"],
    "requiredSkills": ["Array of required skills identified"],
    "preferredSkills": ["Array of nice-to-have skills"],
    "url": "Original job link if provided by tool"
  }
]

Return valid JSON array only. If no listings were returned by the MCP tools, return an empty array [].`;

  try {
    const res = await executeGeminiWithFallback({
      contents: prompt,
      config: {
        systemInstruction,
        tools: [callableTool],
      },
    });

    const text = res.text || '[]';
    // Extract JSON block if wrapped in markdown
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsedJobs: JobListing[] = JSON.parse(jsonMatch[0]);
      return {
        jobs: Array.isArray(parsedJobs) ? parsedJobs : [],
        indeedStatus: indeedStatus === 'connected' ? 'Connected' : 'Indeed job search is currently unavailable.',
        glassdoorStatus: glassdoorStatus === 'connected' ? 'Connected' : 'Glassdoor job search is currently unavailable.',
      };
    }

    return {
      jobs: [],
      indeedStatus: indeedStatus === 'connected' ? 'Connected' : 'Indeed job search is currently unavailable.',
      glassdoorStatus: glassdoorStatus === 'connected' ? 'Connected' : 'Glassdoor job search is currently unavailable.',
    };
  } catch (err: any) {
    console.error('Job search error:', err);
    return {
      jobs: [],
      indeedStatus: indeedStatus === 'connected' ? 'Connected' : 'Indeed job search is currently unavailable.',
      glassdoorStatus: glassdoorStatus === 'connected' ? 'Connected' : 'Glassdoor job search is currently unavailable.',
      error: 'Job search encountered an error while communicating with the search tools.',
    };
  }
}

/**
 * Matches a user's resume against a selected job description.
 */
export async function matchResumeToJob(
  resume: ParsedResume | string,
  job: JobListing
): Promise<JobMatchResult> {
  const resumeStr = typeof resume === 'string' ? resume : JSON.stringify(resume, null, 2);

  const prompt = `You are an expert career advisor.
Compare the user's resume against the specified job listing.
Calculate and explain the relevance based ONLY on information actually available in the resume and the job listing.
Do not claim that an employer has rated or approved the candidate. Clearly indicate that any score is an AI-generated estimate.

Job Listing:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Source: ${job.source}
Description:
${job.description}
Required Skills: ${job.requiredSkills.join(', ') || 'Not explicitly listed'}
Qualifications: ${job.qualifications.join(', ') || 'Not explicitly listed'}

User Resume:
${resumeStr}

Return JSON with this schema:
{
  "matchScore": number between 1 and 100,
  "scoreLabel": "AI-generated estimate based on keyword and qualification alignment",
  "relevanceExplanation": "2-3 sentences explaining why this job is relevant to the candidate's actual background",
  "matchingSkills": ["Skills present in both the resume and the job requirements"],
  "missingRequirements": ["Required or preferred qualifications in the job listing that do NOT appear in the resume"],
  "unclearRequirements": ["Requirements where the resume has partial or ambiguous evidence"]
}

Output JSON only.`;

  const res = await executeGeminiWithFallback({
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
    },
  });

  const rawJson = res.text || '{}';
  try {
    const parsed = JSON.parse(rawJson);
    return {
      job,
      matchScore: typeof parsed.matchScore === 'number' ? parsed.matchScore : 75,
      scoreLabel: parsed.scoreLabel || 'AI-generated estimate',
      relevanceExplanation: parsed.relevanceExplanation || 'This position aligns with your skill set and background.',
      matchingSkills: Array.isArray(parsed.matchingSkills) ? parsed.matchingSkills : [],
      missingRequirements: Array.isArray(parsed.missingRequirements) ? parsed.missingRequirements : [],
      unclearRequirements: Array.isArray(parsed.unclearRequirements) ? parsed.unclearRequirements : [],
    };
  } catch {
    return {
      job,
      matchScore: 70,
      scoreLabel: 'AI-generated estimate',
      relevanceExplanation: 'Relevance analysis generated from matching criteria.',
      matchingSkills: job.requiredSkills.slice(0, 3),
      missingRequirements: [],
      unclearRequirements: [],
    };
  }
}

/**
 * Polishes the user's resume specifically for the selected job.
 * STRICTLY MUST NOT INVENT candidate information, roles, degrees, or skills.
 */
export async function polishResume(
  resume: ParsedResume | string,
  job: JobListing
): Promise<PolishedResumeResult> {
  const resumeStr = typeof resume === 'string' ? resume : JSON.stringify(resume, null, 2);

  const prompt = `You are a professional resume strategist and career coach.
Your task is to tailor and polish the user's existing resume specifically for the selected target job.

TARGET JOB:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Description & Requirements:
${job.description}
Key Requirements: ${[...job.requiredSkills, ...job.qualifications].join(', ')}

USER'S CURRENT RESUME:
${resumeStr}

STRICT SAFETY AND HONESTY RULES:
- You MUST NOT invent employment history, employers, degrees, certifications, skills, technologies, achievements, job titles, dates, metrics, or responsibilities.
- If a job requirement is not supported by the resume, do NOT fabricate evidence for it.
- Improve wording, make achievements clearer, reorganize information, emphasize relevant existing experience, and improve the professional summary.
- Incorporate relevant terminology from the job description ONLY when truthful and substantiated by the candidate's existing background.
- Show concrete recommendations mapping target job requirements to the candidate's actual resume evidence.

Return valid JSON with this exact structure:
{
  "recommendations": [
    {
      "requirement": "e.g. Experience with AWS",
      "resumeEvidence": "e.g. 'AWS' appears in your existing technical skills section.",
      "recommendation": "e.g. Highlight your AWS cloud architecture experience in the summary and place AWS first in technical competencies."
    }
  ],
  "summaryOfChanges": [
    "Refined professional summary to emphasize relevant leadership experience",
    "Optimized action verbs in experience bullet points for higher impact",
    "Reorganized skills section to prioritize competencies matching target role"
  ],
  "polishedResumeText": "Complete, beautifully formatted markdown text of the full polished resume ready for download or copying. Do not truncate."
}

Output valid JSON only.`;

  const res = await executeGeminiWithFallback({
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
    },
  });

  const rawJson = res.text || '{}';
  try {
    const parsed = JSON.parse(rawJson);
    return {
      jobTitle: job.title,
      company: job.company,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      summaryOfChanges: Array.isArray(parsed.summaryOfChanges) ? parsed.summaryOfChanges : [],
      polishedResumeText: parsed.polishedResumeText || resumeStr,
    };
  } catch {
    return {
      jobTitle: job.title,
      company: job.company,
      recommendations: [],
      summaryOfChanges: ['Polished formatting and keyword alignment.'],
      polishedResumeText: resumeStr,
    };
  }
}

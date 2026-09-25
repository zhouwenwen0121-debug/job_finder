/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { mcpManager } from './hasdataClient.ts';
import {
  parseResume,
  searchJobsWithMcp,
  matchResumeToJob,
  polishResume,
} from './geminiService.ts';
import {
  scrapeWeb,
  scrapeGoogleSerp,
  verifyHasDataScrape,
} from './hasdataScraper.ts';

dotenv.config();

export const app = express();

app.use(express.json({ limit: '10mb' }));

// Initial connection attempt on startup if key is available
mcpManager.ensureConnected().catch(() => {
  console.log('Initial HasData MCP connection check completed.');
});

// MCP Status endpoint
app.get('/api/mcp/status', async (_req: Request, res: Response) => {
  const status = await mcpManager.ensureConnected();
  res.json(status);
});

// Alias for status
app.get('/api/mcp-status', async (_req: Request, res: Response) => {
  const status = await mcpManager.ensureConnected();
  res.json(status);
});

// Force reconnect / refresh
app.post('/api/mcp/refresh', async (_req: Request, res: Response) => {
  const status = await mcpManager.connectAll();
  res.json(status);
});

// Resume parsing endpoint
app.post('/api/resume/parse', async (req: Request, res: Response) => {
  try {
    const { resumeText } = req.body;
    if (!resumeText || typeof resumeText !== 'string' || !resumeText.trim()) {
      res.status(400).json({ error: 'Resume text is required' });
      return;
    }
    const parsed = await parseResume(resumeText);
    res.json(parsed);
  } catch (err: any) {
    console.error('Resume parsing error:', err);
    res.status(500).json({ error: 'Failed to analyze resume', details: err?.message || 'Unknown error' });
  }
});

// Job search endpoint using Indeed & Glassdoor MCP tools
app.post('/api/jobs/search', async (req: Request, res: Response) => {
  try {
    const {
      desiredJobTitle,
      preferredLocation,
      keywords,
      arrangement,
      resumeSkills,
      resumeJobTitles,
    } = req.body;

    const result = await searchJobsWithMcp({
      desiredJobTitle,
      preferredLocation,
      keywords,
      arrangement,
      resumeSkills,
      resumeJobTitles,
    });

    res.json(result);
  } catch (err: any) {
    console.error('Job search error:', err);
    res.status(500).json({
      jobs: [],
      error: 'Job search encountered an unexpected failure.',
      indeedStatus: 'Indeed job search is currently unavailable.',
      glassdoorStatus: 'Glassdoor job search is currently unavailable.',
    });
  }
});

// Resume to Job matching endpoint
app.post('/api/resume/match', async (req: Request, res: Response) => {
  try {
    const { resume, job } = req.body;
    if (!resume || !job) {
      res.status(400).json({ error: 'Both resume and job data are required for matching.' });
      return;
    }

    const matchResult = await matchResumeToJob(resume, job);
    res.json(matchResult);
  } catch (err: any) {
    console.error('Resume matching error:', err);
    res.status(500).json({ error: 'Failed to match resume to job', details: err?.message || 'Unknown error' });
  }
});

// Resume polishing endpoint
app.post('/api/resume/polish', async (req: Request, res: Response) => {
  try {
    const { resume, job } = req.body;
    if (!resume || !job) {
      res.status(400).json({ error: 'Both resume and job data are required for polishing.' });
      return;
    }

    const polishResult = await polishResume(resume, job);
    res.json(polishResult);
  } catch (err: any) {
    console.error('Resume polish error:', err);
    res.status(500).json({ error: 'Failed to polish resume', details: err?.message || 'Unknown error' });
  }
});

// HasData Scraping verification endpoint (single request, checks credit/key)
app.get('/api/hasdata/verify', async (_req: Request, res: Response) => {
  const result = await verifyHasDataScrape();
  res.status(result.status || (result.success ? 200 : 500)).json(result);
});

// HasData Web Scraping proxy endpoint
app.post('/api/hasdata/scrape', async (req: Request, res: Response) => {
  try {
    const { url, extractRules, outputFormat, screenshot, jsRendering, proxyType } = req.body;
    if (!url) {
      res.status(400).json({ error: 'URL is required for web scraping.' });
      return;
    }
    const data = await scrapeWeb({ url, extractRules, outputFormat, screenshot, jsRendering, proxyType });
    res.json(data);
  } catch (err: any) {
    console.error('HasData scrape error:', err);
    res.status(err?.status || 500).json({
      error: err?.message || 'Web scraping failed',
      details: err?.response || null,
    });
  }
});

// HasData Google SERP proxy endpoint
app.get('/api/hasdata/serp', async (req: Request, res: Response) => {
  try {
    const { q, location, domain, gl, hl, num, page, deviceType } = req.query;
    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Query parameter "q" is required.' });
      return;
    }
    const data = await scrapeGoogleSerp({
      q,
      location: location as string | undefined,
      domain: domain as string | undefined,
      gl: gl as string | undefined,
      hl: hl as string | undefined,
      num: num ? Number(num) : undefined,
      page: page ? Number(page) : undefined,
      deviceType: deviceType as any,
    });
    res.json(data);
  } catch (err: any) {
    console.error('HasData SERP error:', err);
    res.status(err?.status || 500).json({
      error: err?.message || 'Google SERP scraping failed',
      details: err?.response || null,
    });
  }
});


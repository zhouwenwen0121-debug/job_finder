/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * HasData Web Scraping and Structured Data Client
 *
 * All requests authenticate with secret API key in the `x-api-key` header.
 * Requests stay strictly server-side and never expose keys to browser code.
 * Requests are sent only to https://api.hasdata.com or https://mcp.hasdata.com.
 */

const HASDATA_API_BASE = 'https://api.hasdata.com';

function getApiKey(): string {
  const key = (process.env.HASDATA_API_KEY || '').trim();
  return key;
}

export interface WebScrapeOptions {
  url: string;
  outputFormat?: Array<'html' | 'text' | 'markdown'>;
  extractRules?: Record<string, string | object>;
  proxyType?: 'datacenter' | 'residential';
  proxyCountry?: string;
  screenshot?: boolean;
  jsRendering?: boolean;
  waitFor?: number | string;
  customHeaders?: Record<string, string>;
  customCookies?: Record<string, string>;
  [key: string]: any;
}

export interface GoogleSerpOptions {
  q: string;
  location?: string;
  domain?: string;
  gl?: string;
  hl?: string;
  num?: number;
  page?: number;
  deviceType?: 'desktop' | 'mobile' | 'tablet';
}

/**
 * Scrapes any web page using HasData Web Scraping API.
 * Endpoint: POST https://api.hasdata.com/scrape/web
 */
export async function scrapeWeb(options: WebScrapeOptions): Promise<any> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('HASDATA_API_KEY is not configured in server environment.');
  }

  const response = await fetch(`${HASDATA_API_BASE}/scrape/web`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(options),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.message || data?.error || `HasData request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    (err as any).status = response.status;
    (err as any).response = data;
    throw err;
  }

  return data;
}

/**
 * Scrapes Google SERP using HasData Google SERP API.
 * Endpoint: GET https://api.hasdata.com/scrape/google/serp
 */
export async function scrapeGoogleSerp(options: GoogleSerpOptions): Promise<any> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('HASDATA_API_KEY is not configured in server environment.');
  }

  const url = new URL(`${HASDATA_API_BASE}/scrape/google/serp`);
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.message || data?.error || `HasData Google SERP failed with status ${response.status}`;
    const err = new Error(errorMsg);
    (err as any).status = response.status;
    (err as any).response = data;
    throw err;
  }

  return data;
}

/**
 * Single test request to verify HasData API key connectivity and credit access.
 * Confirms HTTP 200 with scraped content without looping (saves credits).
 */
export async function verifyHasDataScrape(): Promise<{
  success: boolean;
  status: number;
  data?: any;
  error?: string;
}> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      success: false,
      status: 401,
      error: 'HASDATA_API_KEY is not set in server environment variables (.env).',
    };
  }

  try {
    const response = await fetch(`${HASDATA_API_BASE}/scrape/web`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        url: 'https://example.com',
        extractRules: {
          title: 'h1',
        },
      }),
    });

    const status = response.status;
    const data = await response.json().catch(() => null);

    if (response.ok) {
      return {
        success: true,
        status,
        data,
      };
    } else {
      return {
        success: false,
        status,
        error: data?.message || data?.error || `HasData returned status ${status}`,
        data,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      status: 500,
      error: err?.message || 'Network error connecting to HasData API',
    };
  }
}

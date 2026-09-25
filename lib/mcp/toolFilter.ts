/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MCPToolInfo {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
  [key: string]: any;
}

export interface ToolFilterResult {
  safe: boolean;
  reason?: string;
  category: 'search' | 'analytics' | 'skills' | 'resume_analysis' | 'content_generation' | 'other_safe' | 'blocked';
}

/**
 * Strict regex patterns for blocked external side effects and destructive actions.
 * Any tool matching these patterns in its name or description will fail closed.
 */
const BLOCKED_NAME_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Auto-apply / Job submission
  { pattern: /(?:^|[_\W])(?:auto_?apply|apply_to_job|submit_app|submit_application|job_application|one_click_apply)(?:$|[_\W])/i, reason: "Automated job application and external submission prohibited" },
  // Email and messaging side effects
  { pattern: /(?:^|[_\W])(?:send_?email|send_?message|send_?sms|send_?dm|dispatch_?mail|compose_?and_?send|post_?message)(?:$|[_\W])/i, reason: "External communications and message sending prohibited" },
  // Deletion / Destruction
  { pattern: /(?:^|[_\W])(?:delete_|destroy_|drop_|wipe_|purge_|erase_|remove_account)(?:$|[_\W])/i, reason: "Destructive operations and deletion prohibited" },
  // Financial transactions / payments
  { pattern: /(?:^|[_\W])(?:purchase|buy|charge|pay|payment|checkout|spend_money|bill_card|subscribe)(?:$|[_\W])/i, reason: "Financial transactions and monetary charges prohibited" },
  // External account creation and mutation
  { pattern: /(?:^|[_\W])(?:create_?account|register_?user|change_?password|reset_?password|delete_?user|mutate_?external)(?:$|[_\W])/i, reason: "Modifying external accounts or credentials prohibited" },
  // External posting / writing records
  { pattern: /(?:^|[_\W])(?:post_?job|publish_?job|create_?listing|modify_?listing|write_?db)(?:$|[_\W])/i, reason: "Modifying external listings or persistent database records prohibited" }
];

const BLOCKED_DESCRIPTION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /automatically\s+apply/i, reason: "Automated job application prohibited" },
  { pattern: /submits?\s+(?:a\s+)?(?:job\s+)?application/i, reason: "External application submission prohibited" },
  { pattern: /applies\s+for\s+jobs?\s+on\s+your\s+behalf/i, reason: "Auto-applying on behalf of user prohibited" },
  { pattern: /sends?\s+(?:an?\s+)?(?:email|sms|message|notification)\s+to/i, reason: "Sending external messages prohibited" },
  { pattern: /charges?\s+(?:your\s+)?(?:card|account|credit)/i, reason: "Financial charges prohibited" },
  { pattern: /deletes?\s+(?:all\s+)?(?:data|records|accounts?|users?)/i, reason: "Destructive deletions prohibited" },
  { pattern: /creates?\s+an?\s+external\s+account/i, reason: "External account creation prohibited" },
  { pattern: /modifies?\s+(?:external\s+)?records?\s+in/i, reason: "Direct mutation of external records prohibited" }
];

/**
 * Categorizes safe tools for clear UI display and metadata.
 */
function categorizeTool(tool: MCPToolInfo): ToolFilterResult['category'] {
  const name = tool.name.toLowerCase();
  const desc = (tool.description || '').toLowerCase();

  if (name.includes('job') || name.includes('search') || desc.includes('search jobs') || desc.includes('openings') || desc.includes('listings')) {
    return 'search';
  }
  if (name.includes('ilo') || name.includes('oecd') || name.includes('stat') || name.includes('rate') || desc.includes('labor') || desc.includes('statistics') || desc.includes('unemployment') || desc.includes('market data')) {
    return 'analytics';
  }
  if (name.includes('skill') || name.includes('competenc') || desc.includes('skills') || desc.includes('framework')) {
    return 'skills';
  }
  if (name.includes('match') || name.includes('compare') || name.includes('score') || desc.includes('match') || desc.includes('compatibility') || desc.includes('ats')) {
    return 'resume_analysis';
  }
  if (name.includes('cover_letter') || name.includes('resume') || name.includes('tailor') || name.includes('generate') || desc.includes('cover letter') || desc.includes('tailor')) {
    return 'content_generation';
  }
  return 'other_safe';
}

/**
 * Evaluates whether an MCP tool is safe for execution.
 * Fails closed for any questionable or side-effecting tools.
 */
export function isToolSafe(tool: MCPToolInfo): ToolFilterResult {
  if (!tool || typeof tool !== 'object' || !tool.name) {
    return { safe: false, reason: "Malformed or unnamed tool definition", category: 'blocked' };
  }

  const name = tool.name.trim();
  const desc = tool.description || '';

  // 1. Check blocked name patterns
  for (const { pattern, reason } of BLOCKED_NAME_PATTERNS) {
    if (pattern.test(name)) {
      return { safe: false, reason: `Blocked: ${reason} (Matched: "${name}")`, category: 'blocked' };
    }
  }

  // 2. Check blocked description patterns
  for (const { pattern, reason } of BLOCKED_DESCRIPTION_PATTERNS) {
    if (pattern.test(desc)) {
      return { safe: false, reason: `Blocked: ${reason} in tool description`, category: 'blocked' };
    }
  }

  // 3. Inspect schema for high-risk side effect fields
  const schemaProps = tool.inputSchema?.properties;
  if (schemaProps && typeof schemaProps === 'object') {
    const propKeys = Object.keys(schemaProps).map(k => k.toLowerCase());
    if (propKeys.some(k => k.includes('credit_card') || k.includes('cvv') || k.includes('payment_token') || k.includes('bank_account'))) {
      return { safe: false, reason: "Blocked: Tool accepts sensitive financial credentials in input schema", category: 'blocked' };
    }
    if (propKeys.includes('recipient_email') || propKeys.includes('to_phone_number')) {
      return { safe: false, reason: "Blocked: Tool accepts direct messaging recipient addresses", category: 'blocked' };
    }
  }

  // Safe read-only / analytical / local content generation tool
  const category = categorizeTool(tool);
  return { safe: true, category };
}

/**
 * Filters an array of MCP tools, returning safe tools and detailed records of blocked tools.
 */
export function filterDiscoveredTools(tools: MCPToolInfo[]): {
  safeTools: MCPToolInfo[];
  blockedTools: Array<{ tool: MCPToolInfo; reason: string }>;
  stats: {
    totalDiscovered: number;
    totalEnabled: number;
    totalBlocked: number;
  };
} {
  const safeTools: MCPToolInfo[] = [];
  const blockedTools: Array<{ tool: MCPToolInfo; reason: string }> = [];

  for (const tool of tools) {
    const filterResult = isToolSafe(tool);
    if (filterResult.safe) {
      safeTools.push(tool);
    } else {
      blockedTools.push({
        tool,
        reason: filterResult.reason || "Disallowed operation"
      });
    }
  }

  return {
    safeTools,
    blockedTools,
    stats: {
      totalDiscovered: tools.length,
      totalEnabled: safeTools.length,
      totalBlocked: blockedTools.length
    }
  };
}

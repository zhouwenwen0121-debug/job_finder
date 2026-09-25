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
}

/**
 * Strict regex patterns for blocked external side effects and destructive actions.
 * Any tool matching these patterns in its name or description will fail closed.
 */
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(?:^|[_\W])(?:auto_?apply|apply_to_job|submit_app|submit_application|job_application|one_click_apply)(?:$|[_\W])/i, reason: "Automated job application prohibited" },
  { pattern: /(?:^|[_\W])(?:send_?email|send_?message|send_?sms|send_?dm|dispatch_?mail|compose_?and_?send|post_?message)(?:$|[_\W])/i, reason: "External communications and messaging prohibited" },
  { pattern: /(?:^|[_\W])(?:delete_|destroy_|drop_|wipe_|purge_|erase_|remove_account)(?:$|[_\W])/i, reason: "Destructive operations prohibited" },
  { pattern: /(?:^|[_\W])(?:purchase|buy|charge|pay|payment|checkout|spend_money|bill_card|subscribe)(?:$|[_\W])/i, reason: "Financial transactions prohibited" },
  { pattern: /(?:^|[_\W])(?:create_?account|register_?user|change_?password|reset_?password|delete_?user|mutate_?external)(?:$|[_\W])/i, reason: "Modifying external accounts prohibited" },
  { pattern: /(?:^|[_\W])(?:post_?job|publish_?job|create_?listing|modify_?listing|write_?db)(?:$|[_\W])/i, reason: "Modifying external listings prohibited" }
];

const BLOCKED_DESCRIPTION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /automatically\s+apply/i, reason: "Automated job application prohibited" },
  { pattern: /submits?\s+(?:a\s+)?(?:job\s+)?application/i, reason: "External application submission prohibited" },
  { pattern: /applies\s+for\s+jobs?\s+on\s+your\s+behalf/i, reason: "Auto-applying on behalf of user prohibited" },
  { pattern: /sends?\s+(?:an?\s+)?(?:email|sms|message|notification)\s+to/i, reason: "Sending external messages prohibited" },
  { pattern: /charges?\s+(?:your\s+)?(?:card|account|credit)/i, reason: "Financial charges prohibited" },
  { pattern: /deletes?\s+(?:all\s+)?(?:data|records|accounts?|users?)/i, reason: "Destructive deletions prohibited" }
];

/**
 * Validates whether an MCP tool is read-only and safe for job searching.
 */
export function isToolSafe(tool: MCPToolInfo): ToolFilterResult {
  if (!tool || typeof tool !== 'object' || !tool.name) {
    return { safe: false, reason: "Malformed or unnamed tool definition" };
  }

  const name = tool.name.trim();
  const desc = tool.description || '';

  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(name)) {
      return { safe: false, reason: `Blocked: ${reason}` };
    }
  }

  for (const { pattern, reason } of BLOCKED_DESCRIPTION_PATTERNS) {
    if (pattern.test(desc)) {
      return { safe: false, reason: `Blocked: ${reason} in description` };
    }
  }

  // Schema checks
  const props = tool.inputSchema?.properties;
  if (props && typeof props === 'object') {
    const keys = Object.keys(props).map(k => k.toLowerCase());
    if (keys.some(k => k.includes('credit_card') || k.includes('payment_token') || k.includes('bank_account'))) {
      return { safe: false, reason: "Blocked: Sensitive financial properties in tool schema" };
    }
    if (keys.includes('recipient_email') || keys.includes('to_phone_number')) {
      return { safe: false, reason: "Blocked: Direct communication recipient properties in tool schema" };
    }
  }

  return { safe: true };
}

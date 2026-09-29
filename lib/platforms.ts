/** Display names and logos. Logos come from One's connector assets. */
export const PLATFORM_NAMES: Record<string, string> = {
  attio: "Attio",
  hubspot: "HubSpot",
  gmail: "Gmail",
  resend: "Resend",
};

export const logo = (platform: string) => `https://assets.withone.ai/connectors/${platform}.svg`;
export const platformName = (p?: string) => (p ? PLATFORM_NAMES[p] ?? p.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "One");

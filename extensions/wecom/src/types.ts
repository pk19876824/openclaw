import { z } from "zod";

export const WeComConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    corpId: z.string().optional(),
    agentId: z.string().optional(),
    secret: z.string().optional(),
    token: z.string().optional(),
    encodingAESKey: z.string().optional(),
    webhookPath: z.string().optional(),
    webhookHost: z.string().optional(),
    webhookPort: z.number().int().positive().optional(),
    dmPolicy: z.enum(["open", "pairing", "allowlist"]).optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    groupPolicy: z.enum(["open", "allowlist", "disabled"]).optional(),
    groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    requireMention: z.boolean().optional(),
    historyLimit: z.number().int().min(0).optional(),
    dmHistoryLimit: z.number().int().min(0).optional(),
    textChunkLimit: z.number().int().min(1).optional(),
    mediaMaxMb: z.number().min(0).optional(),
  })
  .strict();

export type WeComConfig = z.infer<typeof WeComConfigSchema>;
export type WeComGroupConfig = {
  requireMention?: boolean;
  tools?: {
    allow?: string[];
    deny?: string[];
  };
  skills?: string[];
  enabled?: boolean;
  allowFrom?: Array<string | number>;
  systemPrompt?: string;
};

export interface ResolvedWeComAccount {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name: string;
  corpId?: string;
  agentId?: string;
  config?: WeComConfig;
  token?: string;
  encodingAESKey?: string;
}

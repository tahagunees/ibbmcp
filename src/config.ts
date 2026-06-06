import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  ibbApiToken: process.env.IBB_API_TOKEN,
  sehirHaritasiApiKey: process.env.SEHIRHARITASI_API_KEY,
  iettApiKey: process.env.IETT_API_KEY,
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  llmProvider: process.env.LLM_PROVIDER ?? 'auto',
  llmApiKey: process.env.LLM_API_KEY,
  llmBaseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
  llmModel: process.env.LLM_MODEL ?? 'gpt-4.1-mini',
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  geminiBaseUrl:
    process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  deepseekModel: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
  ckanBaseUrl: 'https://data.ibb.gov.tr/api/3/action',
};

export const serverInfo = {
  name: 'ibb-mcp-server',
  version: '0.1.0',
  description: 'İBB açık verilerini MCP üzerinden sunan ajan sunucu',
};

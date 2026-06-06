import axios from 'axios';
import { config } from '../config';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface GenerateAnswerArgs {
  question: string;
  analysis: unknown;
  relatedDatasets?: unknown;
}

type ProviderName = 'openai-compatible' | 'gemini' | 'deepseek';
const geminiFallbackModel = 'gemini-2.5-flash-lite';

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableGeminiError(error: unknown) {
  return axios.isAxiosError(error) && [429, 500, 502, 503, 504].includes(error.response?.status ?? 0);
}

function toProviderError(provider: ProviderName, error: unknown): Error {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const apiMessage =
      typeof error.response?.data?.error?.message === 'string'
        ? error.response.data.error.message
        : typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : error.message;

    return new Error(`${provider} hatasi${status ? ` (${status})` : ''}: ${apiMessage}`);
  }

  return error instanceof Error ? error : new Error(`${provider} hatasi: bilinmeyen hata`);
}

function extractMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export function isLlmConfigured() {
  return Boolean(resolveProviderConfig());
}

export function getResolvedLlmInfo() {
  const provider = resolveProviderConfig();
  if (!provider) return null;

  return {
    provider: provider.provider,
    model: provider.model,
    baseUrl: provider.baseUrl,
  };
}

function resolveProviderConfig():
  | {
      provider: ProviderName;
      apiKey: string;
      model: string;
      baseUrl: string;
    }
  | null {
  const preferred = config.llmProvider.trim().toLowerCase();

  if (preferred === 'gemini') {
    return config.geminiApiKey
      ? {
          provider: 'gemini',
          apiKey: config.geminiApiKey,
          model: config.geminiModel,
          baseUrl: config.geminiBaseUrl,
        }
      : null;
  }

  if (preferred === 'deepseek') {
    return config.deepseekApiKey
      ? {
          provider: 'deepseek',
          apiKey: config.deepseekApiKey,
          model: config.deepseekModel,
          baseUrl: config.deepseekBaseUrl,
        }
      : null;
  }

  if (preferred === 'openai' || preferred === 'openai-compatible') {
    return config.llmApiKey
      ? {
          provider: 'openai-compatible',
          apiKey: config.llmApiKey,
          model: config.llmModel,
          baseUrl: config.llmBaseUrl,
        }
      : null;
  }

  if (config.geminiApiKey) {
    return {
      provider: 'gemini',
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
      baseUrl: config.geminiBaseUrl,
    };
  }

  if (config.deepseekApiKey) {
    return {
      provider: 'deepseek',
      apiKey: config.deepseekApiKey,
      model: config.deepseekModel,
      baseUrl: config.deepseekBaseUrl,
    };
  }

  if (config.llmApiKey) {
    return {
      provider: 'openai-compatible',
      apiKey: config.llmApiKey,
      model: config.llmModel,
      baseUrl: config.llmBaseUrl,
    };
  }

  return null;
}

async function callOpenAiCompatibleChat(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
}) {
  let response;
  try {
    response = await axios.post(
      `${args.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        model: args.model,
        temperature: 0.2,
        messages: args.messages,
      },
      {
        headers: {
          Authorization: `Bearer ${args.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 45000,
      }
    );
  } catch (error) {
    throw toProviderError('openai-compatible', error);
  }

  const firstChoice = response.data?.choices?.[0];
  const text = extractMessageContent(firstChoice?.message?.content);
  if (!text) {
    throw new Error('LLM bos veya gecersiz bir yanit dondurdu.');
  }

  return text.trim();
}

async function callGeminiGenerateContent(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  fallbackTried?: boolean;
}) {
  const systemMessage = args.messages.find((message) => message.role === 'system');
  const userMessages = args.messages.filter((message) => message.role !== 'system');
  const contents = userMessages.map((message, index) => ({
    role: message.role === 'user' ? 'user' : 'model',
    parts: [
      {
        text:
          index === 0 && systemMessage
            ? [`Sistem talimati: ${systemMessage.content}`, message.content].join('\n\n')
            : message.content,
      },
    ],
  }));

  let response;
  try {
    response = await axios.post(
      `${args.baseUrl.replace(/\/$/, '')}/models/${args.model}:generateContent`,
      {
        contents,
        generation_config: {
          temperature: 0.2,
        },
      },
      {
        headers: {
          'x-goog-api-key': args.apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 45000,
      }
    );
  } catch (error) {
    if (isRetryableGeminiError(error) && !args.fallbackTried) {
      await wait(1200);
      return callGeminiGenerateContent({
        ...args,
        model: args.model === geminiFallbackModel ? args.model : geminiFallbackModel,
        fallbackTried: true,
      });
    }

    throw toProviderError('gemini', error);
  }

  const text =
    response.data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? '')
      .join('\n')
      .trim() ?? '';

  if (!text) {
    throw new Error('LLM bos veya gecersiz bir yanit dondurdu.');
  }

  return {
    model: args.model,
    text: text.trim(),
  };
}

export async function generateCityAnswer(args: GenerateAnswerArgs) {
  const providerConfig = resolveProviderConfig();
  if (!providerConfig) {
    throw new Error(
      'LLM ayarlari eksik. Gemini icin GEMINI_API_KEY, DeepSeek icin DEEPSEEK_API_KEY veya generic kullanim icin LLM_API_KEY tanimlanmali.'
    );
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'Sen Istanbul acik veri odakli bir sehir analizi asistansin. Kullaniciya Turkce, net, ihtiyatli ve veri sinirlarini acikca belirten cevap ver. Uydurma bilgi ekleme. Belirsizlik varsa bunu soyle. Cevapta once kisa sonuc, sonra kullanilan veri seti mantigi ve sinirlar olsun.',
    },
    {
      role: 'user',
      content: [
        `Kullanici sorusu: ${args.question}`,
        'Analiz cikti JSON:',
        JSON.stringify(args.analysis, null, 2),
        'Ilgili veri setleri JSON:',
        JSON.stringify(args.relatedDatasets ?? null, null, 2),
      ].join('\n\n'),
    },
  ];

  const geminiResponse =
    providerConfig.provider === 'gemini'
      ? await callGeminiGenerateContent({
          baseUrl: providerConfig.baseUrl,
          apiKey: providerConfig.apiKey,
          model: providerConfig.model,
          messages,
        })
      : null;
  const answer =
    geminiResponse?.text ??
    (await callOpenAiCompatibleChat({
      baseUrl: providerConfig.baseUrl,
      apiKey: providerConfig.apiKey,
      model: providerConfig.model,
      messages,
    }));

  return {
    provider: providerConfig.provider,
    baseUrl: providerConfig.baseUrl,
    model: geminiResponse?.model ?? providerConfig.model,
    answer,
  };
}

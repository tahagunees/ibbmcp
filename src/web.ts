import fs from 'fs';
import path from 'path';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { config } from './config';
import {
  analyzeQuestion,
  getDatasetMetadata,
  listRecentDatasetCatalog,
  searchDatasetCatalog,
  suggestRelatedDatasetsForQuestion,
} from './app/analysisService';
import { generateCityAnswer, getResolvedLlmInfo, isLlmConfigured } from './services/llmClient';

const publicDir = path.join(process.cwd(), 'public');

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res: ServerResponse, status: number, text: string, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(text);
}

function getContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function serveStatic(res: ServerResponse, relativeFilePath: string) {
  const filePath = path.join(publicDir, relativeFilePath);
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath)) {
    sendText(res, 404, 'Bulunamadi');
    return;
  }

  const content = fs.readFileSync(filePath);
  sendText(res, 200, content.toString('utf8'), getContentType(filePath));
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function getString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'mcp-city-agent-web',
      llmConfigured: isLlmConfigured(),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/config') {
    const llmInfo = getResolvedLlmInfo();
    sendJson(res, 200, {
      llmConfigured: isLlmConfigured(),
      llmProvider: llmInfo?.provider ?? null,
      llmModel: llmInfo?.model ?? null,
      ckanBaseUrl: config.ckanBaseUrl,
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/datasets/search') {
    const query = (url.searchParams.get('q') ?? '').trim();
    const rows = Number(url.searchParams.get('rows') ?? '8');
    if (query.length < 2) {
      sendJson(res, 400, { error: 'En az 2 karakterlik bir arama sorgusu gerekli.' });
      return;
    }

    const result = await searchDatasetCatalog(query, Math.max(1, Math.min(rows, 20)));
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/datasets/recent') {
    const rows = Number(url.searchParams.get('rows') ?? '12');
    const result = await listRecentDatasetCatalog(0, Math.max(1, Math.min(rows, 20)));
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/datasets/metadata') {
    const datasetName = (url.searchParams.get('name') ?? '').trim();
    if (!datasetName) {
      sendJson(res, 400, { error: 'Dataset adi gerekli.' });
      return;
    }

    const result = await getDatasetMetadata(datasetName);
    if (!result) {
      sendJson(res, 404, { error: 'Veri seti bulunamadi.' });
      return;
    }

    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/analyze') {
    const body = await readJsonBody(req);
    const question = getString(body.question).trim();
    const maxDatasets = Math.max(1, Math.min(getNumber(body.maxDatasets, 3), 5));
    const sampleSize = Math.max(1, Math.min(getNumber(body.sampleSize, 10), 25));
    const useLlm = body.useLlm !== false;

    if (question.length < 5) {
      sendJson(res, 400, { error: 'Soru en az 5 karakter olmalidir.' });
      return;
    }

    const [analysis, relatedDatasets] = await Promise.all([
      analyzeQuestion({ question, maxDatasets, sampleSize }),
      suggestRelatedDatasetsForQuestion({ question, maxDatasets: 6, maxThemes: 3 }),
    ]);

    let llm: Record<string, unknown> | null = null;
    if (useLlm && isLlmConfigured()) {
      try {
        llm = await generateCityAnswer({ question, analysis, relatedDatasets });
      } catch (error) {
        llm = {
          error: error instanceof Error ? error.message : 'LLM cevabi alinamadi.',
        };
      }
    }

    sendJson(res, 200, {
      question,
      analysis,
      relatedDatasets,
      llm,
    });
    return;
  }

  sendJson(res, 404, { error: 'API rotasi bulunamadi.' });
}

const server = createServer(async (req, res) => {
  try {
    const origin = `http://${req.headers.host ?? `localhost:${config.port}`}`;
    const url = new URL(req.url ?? '/', origin);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      serveStatic(res, 'index.html');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/styles.css') {
      serveStatic(res, 'styles.css');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/app.js') {
      serveStatic(res, 'app.js');
      return;
    }

    sendText(res, 404, 'Bulunamadi');
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Beklenmeyen sunucu hatasi.',
    });
  }
});

server.listen(config.port, () => {
  console.log(`Web uygulamasi hazir: http://localhost:${config.port}`);
});

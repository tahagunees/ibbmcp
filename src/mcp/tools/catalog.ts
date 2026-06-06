import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { scanCatalogCoverage, listDatasets, searchDatasets, getDatasetByName } from '../../adapters/ckan';
import { jsonToolOutput, summarizeDataset, summarizeResource, toolOutput, compactText } from '../utils';
import { THEME_DEFINITIONS, getThemeIds, inferDatasetThemes, scoreDatasetForTheme, type ThemeId } from '../analysisUtils';

export function registerCatalogTools(server: McpServer) {
  server.registerTool(
    'catalog_coverage_report',
    {
      title: 'Katalog kapsama raporu',
      description: 'CKAN katalogunu sayfali olarak tarar ve MCP sunucusunun hangi resource tiplerine ne kadar erisebildigini ozetler.',
      inputSchema: {
        maxDatasets: z.number().int().min(1).max(542).default(100).optional(),
        pageSize: z.number().int().min(1).max(100).default(50).optional(),
        sort: z.string().default('metadata_modified desc').optional(),
      },
    },
    async (args: { maxDatasets: number | undefined; pageSize: number | undefined; sort: string | undefined }) => {
      const report = await scanCatalogCoverage({
        maxDatasets: args.maxDatasets ?? 100,
        pageSize: args.pageSize ?? 50,
        sort: args.sort ?? 'metadata_modified desc',
      });

      const coverageRatios = {
        datastoreDatasetRatio: report.scannedDatasets > 0 ? Number((report.datasetsWithDatastore / report.scannedDatasets).toFixed(3)) : 0,
        downloadableDatasetRatio: report.scannedDatasets > 0 ? Number((report.datasetsWithDownloadableFiles / report.scannedDatasets).toFixed(3)) : 0,
        apiDatasetRatio: report.scannedDatasets > 0 ? Number((report.datasetsWithLikelyApis / report.scannedDatasets).toFixed(3)) : 0,
      };

      return jsonToolOutput({ ...report, coverageRatios });
    }
  );

  server.registerTool(
    'list_datasets_by_theme',
    {
      title: 'Temaya gore veri seti listele',
      description: 'Tum IBB katalogundaki veri setlerini secilen temaya gore puanlar ve en ilgili olanlari listeler.',
      inputSchema: {
        theme: z.enum(getThemeIds() as [ThemeId, ...ThemeId[]]),
        rows: z.number().int().min(1).max(50).default(10).optional(),
      },
    },
    async (args: { theme: ThemeId; rows: number | undefined }) => {
      const result = await listDatasets({
        start: 0,
        rows: 600,
        sort: 'metadata_modified desc',
      });

      const ranked = result.results
        .map((dataset) => ({
          dataset,
          score: scoreDatasetForTheme(dataset, args.theme),
          inferredThemes: inferDatasetThemes(dataset).slice(0, 3),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

      return jsonToolOutput({
        theme: args.theme,
        themeLabel: THEME_DEFINITIONS[args.theme].label,
        keywordHints: THEME_DEFINITIONS[args.theme].keywords,
        totalCatalogDatasets: result.count,
        matchedDatasets: ranked.length,
        datasets: ranked.slice(0, args.rows ?? 10).map((item) => ({
          ...summarizeDataset(item.dataset),
          themeScore: Number(item.score.toFixed(2)),
          inferredThemes: item.inferredThemes,
        })),
      });
    }
  );

  server.registerTool(
    'list_recent_datasets',
    {
      title: 'Guncel veri setlerini listele',
      description: 'CKAN package_search ile veri setlerini metadata_modified alanina gore listeler.',
      inputSchema: {
        start: z.number().int().min(0).default(0).optional(),
        rows: z.number().int().min(1).max(50).default(20).optional(),
        sort: z.string().default('metadata_modified desc').optional(),
      },
    },
    async (args: { start: number | undefined; rows: number | undefined; sort: string | undefined }) => {
      const result = await listDatasets({
        start: args.start ?? 0,
        rows: args.rows ?? 20,
        sort: args.sort ?? 'metadata_modified desc',
      });

      return jsonToolOutput({
        total: result.count,
        start: args.start ?? 0,
        rows: args.rows ?? 20,
        sort: args.sort ?? 'metadata_modified desc',
        datasets: result.results.map((dataset) => summarizeDataset(dataset)),
      });
    }
  );

  server.registerTool(
    'search_datasets',
    {
      title: 'İBB veri seti arama',
      description: 'CKAN üzerinden anahtar kelimeyle veri seti arar.',
      inputSchema: {
        query: z.string().min(2, 'En az 2 karakter girilmeli'),
        rows: z.number().int().min(1).max(20).default(5).optional(),
      },
    },
    async (args: { query: string; rows: number | undefined }) => {
      const result = await searchDatasets(args.query, args.rows ?? 5);
      return jsonToolOutput({
        query: args.query,
        total: result.count,
        returned: result.results.length,
        datasets: result.results.map((dataset) => summarizeDataset(dataset)),
      });
    }
  );

  server.registerTool(
    'get_dataset_metadata',
    {
      title: 'Veri seti metadata getir',
      description: 'Bir veri seti icin CKAN package_show cagrisi yapar; metadata, etiketler ve kaynak ozetlerini dondurur.',
      inputSchema: {
        datasetName: z.string().min(2),
      },
    },
    async (args: { datasetName: string }) => {
      const dataset = await getDatasetByName(args.datasetName);
      if (!dataset) {
        return toolOutput(`Veri seti bulunamadi: ${args.datasetName}`);
      }

      return jsonToolOutput({
        id: dataset.id,
        title: dataset.title,
        name: dataset.name,
        notes: compactText(dataset.notes, ''),
        organization: dataset.organization,
        tags: dataset.tags,
        metadataModified: dataset.metadataModified,
        resourceCount: dataset.resourceCount,
        author: dataset.author,
        maintainer: dataset.maintainer,
        extras: dataset.extras,
        resources: dataset.resources.map((resource) => summarizeResource(resource)),
      });
    }
  );
}

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getResourceById, profileResource, previewFileResource, fetchResourcePreview, queryDatastoreResource, inferResourceCapabilities, detectGeospatialFields } from '../../adapters/ckan';
import { jsonToolOutput, summarizeResource, toolOutput } from '../utils';

export function registerResourceTools(server: McpServer) {
  server.registerTool(
    'detect_geospatial_fields',
    {
      title: 'Mekansal alanlari tespit et',
      description: 'Bir resource icinde koordinat, ilce, mahalle, adres ve geometri alanlarini tespit ederek mekansal analiz uygunlugu ozetler.',
      inputSchema: {
        resourceId: z.string().min(10),
        sampleSize: z.number().int().min(1).max(50).default(15).optional(),
      },
    },
    async (args: { resourceId: string; sampleSize: number | undefined }) => {
      const resource = await getResourceById(args.resourceId);
      if (!resource) {
        return toolOutput(`Resource bulunamadi: ${args.resourceId}`);
      }

      const detection = await detectGeospatialFields({
        resourceId: args.resourceId,
        sampleSize: args.sampleSize ?? 15,
      });

      return jsonToolOutput({
        resource: summarizeResource(resource),
        geospatialDetection: detection,
      });
    }
  );

  server.registerTool(
    'profile_resource',
    {
      title: 'Resource profili cikar',
      description: 'Bir resource icin alan tipleri, bosluk orani, tarih ve koordinat ipuclari gibi ozet bir veri profili uretir.',
      inputSchema: {
        resourceId: z.string().min(10),
        sampleSize: z.number().int().min(1).max(100).default(25).optional(),
      },
    },
    async (args: { resourceId: string; sampleSize: number | undefined }) => {
      const resource = await getResourceById(args.resourceId);
      if (!resource) {
        return toolOutput(`Resource bulunamadi: ${args.resourceId}`);
      }

      const profile = await profileResource({
        resourceId: args.resourceId,
        sampleSize: args.sampleSize ?? 25,
      });

      return jsonToolOutput({
        resource: summarizeResource(resource),
        profile,
      });
    }
  );

  server.registerTool(
    'preview_file_resource',
    {
      title: 'Dosya tabanli resource preview',
      description: 'Indirilebilir bir resource icin format bazli parser kullanarak ilk kayitlari veya icerik ozetini dondurur.',
      inputSchema: {
        resourceId: z.string().min(10),
        maxRows: z.number().int().min(1).max(50).default(10).optional(),
      },
    },
    async (args: { resourceId: string; maxRows: number | undefined }) => {
      const resource = await getResourceById(args.resourceId);
      if (!resource) {
        return toolOutput(`Resource bulunamadi: ${args.resourceId}`);
      }

      const capabilities = inferResourceCapabilities(resource);
      if (!capabilities.fileDownloadable) {
        return jsonToolOutput({
          error: 'Bu resource indirilebilir dosya olarak siniflandirilmadi.',
          resource: summarizeResource(resource),
        });
      }

      const preview = await previewFileResource({
        resourceId: args.resourceId,
        maxRows: args.maxRows ?? 10,
      });

      return jsonToolOutput({
        resource: summarizeResource(resource),
        preview,
      });
    }
  );

  server.registerTool(
    'inspect_resource_capabilities',
    {
      title: 'Kaynak yeteneklerini incele',
      description: 'Bir CKAN resource icin datastore, dosya indirme ve API uygunlugunu analiz eder.',
      inputSchema: {
        resourceId: z.string().min(10),
      },
    },
    async (args: { resourceId: string }) => {
      const resource = await getResourceById(args.resourceId);
      if (!resource) {
        return toolOutput(`Resource bulunamadi: ${args.resourceId}`);
      }

      return jsonToolOutput(summarizeResource(resource));
    }
  );

  server.registerTool(
    'query_datastore_resource',
    {
      title: 'Datastore resource sorgula',
      description: 'Datastore destekleyen bir resource icin kayitlari sayfali olarak dondurur.',
      inputSchema: {
        resourceId: z.string().min(10),
        limit: z.number().int().min(1).max(100).default(20).optional(),
        offset: z.number().int().min(0).default(0).optional(),
      },
    },
    async (args: { resourceId: string; limit: number | undefined; offset: number | undefined }) => {
      const resource = await getResourceById(args.resourceId);
      if (!resource) {
        return toolOutput(`Resource bulunamadi: ${args.resourceId}`);
      }

      const capabilities = inferResourceCapabilities(resource);
      if (!capabilities.datastoreQueryable) {
        return jsonToolOutput({
          error: 'Bu resource datastore uzerinden sorgulanabilir degil.',
          resource: summarizeResource(resource),
        });
      }

      const result = await queryDatastoreResource({
        resourceId: args.resourceId,
        limit: args.limit ?? 20,
        offset: args.offset ?? 0,
      });

      return jsonToolOutput({
        resource: summarizeResource(resource),
        total: result.total,
        offset: args.offset ?? 0,
        limit: args.limit ?? 20,
        fields: result.fields?.map((field) => ({ id: field.id, type: field.type })),
        records: result.records,
      });
    }
  );

  server.registerTool(
    'fetch_resource_preview',
    {
      title: 'Veri kaynağı önizleme',
      description: 'resource_id ile CKAN datastore_search çağırır, ilk N kaydı döndürür.',
      inputSchema: {
        resourceId: z.string().min(10),
        limit: z.number().int().min(1).max(50).default(20).optional(),
      },
    },
    async (args: { resourceId: string; limit: number | undefined }) => {
      const resource = await getResourceById(args.resourceId);
      if (!resource) {
        return toolOutput(`Resource bulunamadi: ${args.resourceId}`);
      }

      const capabilities = inferResourceCapabilities(resource);
      if (!capabilities.supportsPreview) {
        return jsonToolOutput({
          error: 'Bu resource icin datastore preview kullanilamiyor.',
          resource: summarizeResource(resource),
        });
      }

      const result = await fetchResourcePreview(args.resourceId, args.limit ?? 20);
      return jsonToolOutput({
        resource: summarizeResource(resource),
        fields: result.fields?.map((field) => field.id) ?? [],
        records: result.records ?? [],
      });
    }
  );
}

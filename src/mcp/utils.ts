import { inferResourceCapabilities, type CkanDatasetSummary, type CkanResourceSummary } from '../adapters/ckan';

export const toolOutput = (text: string) => ({
  content: [{ type: 'text' as const, text }],
});

export const jsonToolOutput = (payload: unknown) =>
  toolOutput(JSON.stringify(payload, null, 2));

export function compactText(value: string | undefined, fallback = 'yok') {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text ? text : fallback;
}

export function summarizeDataset(dataset: CkanDatasetSummary) {
  return {
    title: dataset.title,
    name: dataset.name,
    organization: dataset.organization?.title ?? dataset.organization?.name,
    metadataModified: dataset.metadataModified,
    resourceCount: dataset.resourceCount,
    tags: dataset.tags.slice(0, 8).map((tag) => tag.displayName ?? tag.name),
    notes: compactText(dataset.notes, ''),
    resources: dataset.resources.slice(0, 5).map((resource) => ({
      id: resource.id,
      name: resource.name,
      format: resource.format,
      datastoreActive: resource.datastoreActive ?? false,
      lastModified: resource.lastModified,
      url: resource.url,
    })),
  };
}

export function summarizeResource(resource: CkanResourceSummary) {
  return {
    id: resource.id,
    name: resource.name,
    format: resource.format,
    description: compactText(resource.description, ''),
    url: resource.url,
    mimetype: resource.mimetype,
    datastoreActive: resource.datastoreActive ?? false,
    resourceType: resource.resourceType,
    size: resource.size,
    created: resource.created,
    lastModified: resource.lastModified,
    capabilities: inferResourceCapabilities(resource),
  };
}

export function normalizeCoord(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  if (Math.abs(n) > 180) return n / 1_000_000;
  return n;
}

export function extractYearMonth(resource: { name?: string; url?: string }): number {
  const haystack = `${resource.name ?? ''} ${resource.url ?? ''}`;
  const match = haystack.match(/(20\d{2})(0[1-9]|1[0-2])/);
  if (!match) return -1;
  return Number(`${match[1]}${match[2]}`);
}

export function extractModifiedTs(resource: { lastModified?: string; created?: string }): number {
  const value = resource.lastModified ?? resource.created;
  if (!value) return -1;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? -1 : ts;
}

export function pickNewestResource(
  resources: {
    id: string;
    name: string;
    format?: string;
    url?: string;
    created?: string;
    lastModified?: string;
  }[]
) {
  return resources
    .slice()
    .sort((a, b) => {
      const ymDiff = extractYearMonth(b) - extractYearMonth(a);
      if (ymDiff !== 0) return ymDiff;
      return extractModifiedTs(b) - extractModifiedTs(a);
    })[0];
}

export function makeDatasetLine(d: {
  title: string;
  name: string;
  notes?: string;
  resources: { id: string; name: string; format?: string; url?: string }[];
}) {
  const top = d.resources.slice(0, 2).map((r) => `${r.name} (${r.format ?? 'n/a'})`).join(', ');
  return `- ${d.title} [${d.name}] kaynaklar: ${top || 'kaynak yok'}`;
}

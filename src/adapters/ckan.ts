import { ckanClient } from '../services/httpClient';
import axios from 'axios';
import * as XLSX from 'xlsx';

export interface CkanTag {
  name: string;
  displayName?: string;
}

export interface CkanOrganization {
  name?: string;
  title?: string;
}

export interface CkanExtra {
  key: string;
  value: string;
}

export interface CkanResourceSummary {
  id: string;
  name: string;
  description?: string;
  format?: string;
  mimetype?: string;
  url?: string;
  created?: string;
  lastModified?: string;
  datastoreActive?: boolean;
  size?: number;
  resourceType?: string;
}

export interface CkanDatasetSummary {
  title: string;
  name: string;
  notes?: string;
  organization?: CkanOrganization;
  tags: CkanTag[];
  metadataModified?: string;
  resourceCount: number;
  resources: CkanResourceSummary[];
}

export interface CkanSearchResult {
  count: number;
  results: CkanDatasetSummary[];
}

export interface CkanDatasetDetail extends CkanDatasetSummary {
  id?: string;
  author?: string;
  maintainer?: string;
  extras: CkanExtra[];
}

export interface ResourceCapabilitySummary {
  resourceId: string;
  format?: string;
  datastoreQueryable: boolean;
  fileDownloadable: boolean;
  likelyApiEndpoint: boolean;
  supportsPreview: boolean;
  recommendedAccessMethod: 'datastore' | 'file-download' | 'api' | 'unknown';
}

export interface CatalogCoverageReport {
  scannedDatasets: number;
  totalDatasets: number;
  scannedResources: number;
  datasetsWithDatastore: number;
  datasetsWithDownloadableFiles: number;
  datasetsWithLikelyApis: number;
  datasetsWithoutSupportedResources: number;
  accessMethodCounts: Record<string, number>;
  formatCounts: Record<string, number>;
  sampleDatasets: {
    name: string;
    title: string;
    metadataModified?: string;
    resourceCount: number;
    supportedAccessMethods: string[];
  }[];
}

export interface FileResourcePreview {
  resourceId: string;
  parser: 'spreadsheet' | 'json' | 'xml' | 'text' | 'unsupported';
  format?: string;
  inferredFormat: string;
  sheetNames?: string[];
  fields?: string[];
  records?: Record<string, unknown>[];
  geometryType?: string;
  featureCount?: number;
  rootKeys?: string[];
  previewText?: string;
  warnings: string[];
}

export interface ProfiledField {
  name: string;
  nonNullCount: number;
  nullCount: number;
  nullRatio: number;
  detectedTypes: string[];
  sampleValues: string[];
  looksLikeDate: boolean;
  looksLikeCoordinate: boolean;
}

export interface ResourceProfile {
  resourceId: string;
  accessMethod: 'datastore' | 'file-download' | 'api' | 'unknown';
  parser?: string;
  inferredFormat?: string;
  sampledRecordCount: number;
  fieldCount: number;
  fields: ProfiledField[];
  warnings: string[];
}

export interface GeospatialFieldDetection {
  resourceId: string;
  accessMethod: 'datastore' | 'file-download' | 'api' | 'unknown';
  geometryType?: string;
  coordinateFields: string[];
  districtFields: string[];
  neighborhoodFields: string[];
  addressFields: string[];
  geometryFields: string[];
  locationSignals: string[];
  suitability: 'high' | 'medium' | 'low';
  warnings: string[];
}

function mapTag(tag: any): CkanTag {
  return {
    name: String(tag?.name ?? ''),
    ...(tag?.display_name || tag?.displayName
      ? { displayName: tag?.display_name ?? tag?.displayName }
      : {}),
  };
}

function mapOrganization(org: any): CkanOrganization | undefined {
  if (!org) return undefined;
  return {
    name: org.name,
    title: org.title,
  };
}

function mapResource(resource: any): CkanResourceSummary {
  return {
    id: resource.id,
    name: resource.name ?? resource.description ?? resource.id,
    ...(resource.description ? { description: resource.description } : {}),
    ...(resource.format ? { format: resource.format } : {}),
    ...(resource.mimetype ? { mimetype: resource.mimetype } : {}),
    ...(resource.url ? { url: resource.url } : {}),
    ...(resource.created ? { created: resource.created } : {}),
    ...(resource.last_modified ? { lastModified: resource.last_modified } : {}),
    ...(resource.datastore_active !== undefined
      ? { datastoreActive: Boolean(resource.datastore_active) }
      : {}),
    ...(typeof resource.size === 'number' ? { size: resource.size } : {}),
    ...(resource.resource_type ? { resourceType: resource.resource_type } : {}),
  };
}

function mapDataset(pkg: any): CkanDatasetSummary {
  const resources = pkg.resources?.map((r: any) => mapResource(r)) ?? [];
  const organization = mapOrganization(pkg.organization);
  return {
    title: pkg.title,
    name: pkg.name,
    ...(pkg.notes ? { notes: pkg.notes } : {}),
    ...(organization ? { organization } : {}),
    tags: pkg.tags?.map((tag: any) => mapTag(tag)) ?? [],
    ...(pkg.metadata_modified ? { metadataModified: pkg.metadata_modified } : {}),
    resourceCount: resources.length,
    resources,
  };
}

function mapDatasetDetail(pkg: any): CkanDatasetDetail {
  return {
    ...mapDataset(pkg),
    id: pkg.id,
    author: pkg.author,
    maintainer: pkg.maintainer,
    extras:
      pkg.extras?.map((extra: any) => ({
        key: String(extra.key ?? ''),
        value: String(extra.value ?? ''),
      })) ?? [],
  };
}

function inferDownloadFormat(resource: CkanResourceSummary): string {
  const normalizedFormat = resource.format?.trim().toLowerCase();
  if (normalizedFormat) return normalizedFormat;

  const url = resource.url?.toLowerCase() ?? '';
  const extensions = ['geojson', 'json', 'xlsx', 'xls', 'csv', 'tsv', 'xml', 'zip', 'kml', 'kmz'];
  for (const ext of extensions) {
    if (url.includes(`.${ext}`)) return ext;
  }

  return 'unknown';
}

function isNullLike(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '' || normalized === 'null' || normalized === 'undefined' || normalized === '-';
  }
  return false;
}

function detectValueType(value: unknown): string {
  if (isNullLike(value)) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) return 'integer-string';
    if (/^-?\d+([.,]\d+)?$/.test(trimmed)) return 'number-string';
    return 'string';
  }
  return typeof value;
}

function looksLikeDateValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return true;
  if (/^\d{2}[./-]\d{2}[./-]\d{4}$/.test(trimmed)) return true;
  if (!/[./\-:TZ ]/.test(trimmed)) return false;
  const ts = Date.parse(trimmed);
  return !Number.isNaN(ts);
}

function looksLikeCoordinateValue(value: unknown): boolean {
  const asNumber =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.replace(',', '.'))
        : Number.NaN;

  return Number.isFinite(asNumber) && Math.abs(asNumber) <= 180;
}

function toSampleValue(value: unknown): string {
  if (isNullLike(value)) return '';
  if (typeof value === 'string') return value.slice(0, 120);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value).slice(0, 120);
  } catch {
    return String(value).slice(0, 120);
  }
}

function profileRecords(records: Record<string, unknown>[]): {
  fieldCount: number;
  fields: ProfiledField[];
} {
  const fieldNames = Array.from(
    new Set(records.flatMap((record) => Object.keys(record)))
  );

  const fields = fieldNames.map((name) => {
    const values = records.map((record) => record[name]);
    const nonNullValues = values.filter((value) => !isNullLike(value));
    const nullCount = values.length - nonNullValues.length;
    const detectedTypes = Array.from(
      new Set(nonNullValues.map((value) => detectValueType(value)))
    );
    const sampleValues = Array.from(
      new Set(nonNullValues.map((value) => toSampleValue(value)).filter(Boolean))
    ).slice(0, 5);
    const looksLikeDate = nonNullValues.some((value) => looksLikeDateValue(value));
    const coordinateNameHint = /(lat|latitude|lon|lng|long|longitude|coord|enlem|boylam)/i.test(
      name
    );
    const looksLikeCoordinate =
      coordinateNameHint &&
      nonNullValues.length > 0 &&
      nonNullValues.every((value) => looksLikeCoordinateValue(value));

    return {
      name,
      nonNullCount: nonNullValues.length,
      nullCount,
      nullRatio: values.length > 0 ? Number((nullCount / values.length).toFixed(3)) : 0,
      detectedTypes,
      sampleValues,
      looksLikeDate,
      looksLikeCoordinate,
    };
  });

  return {
    fieldCount: fieldNames.length,
    fields,
  };
}

async function downloadResourceBuffer(url: string): Promise<Buffer> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
  });
  return Buffer.from(response.data);
}

function previewSpreadsheet(
  buffer: Buffer,
  format: string,
  maxRows: number
): FileResourcePreview {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = workbook.SheetNames;
  const firstSheetName = sheetNames[0];
  if (!firstSheetName) {
    return {
      resourceId: '',
      parser: 'spreadsheet',
      format,
      inferredFormat: format,
      sheetNames,
      warnings: ['Calisma sayfasi bulunamadi.'],
    };
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    return {
      resourceId: '',
      parser: 'spreadsheet',
      format,
      inferredFormat: format,
      sheetNames,
      warnings: ['Ilk calisma sayfasi okunamadi.'],
    };
  }

  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });
  const firstRecord = records[0] ?? {};

  return {
    resourceId: '',
    parser: 'spreadsheet',
    format,
    inferredFormat: format,
    sheetNames,
    fields: Object.keys(firstRecord),
    records: records.slice(0, maxRows),
    warnings: [],
  };
}

function previewJsonText(text: string, format: string, maxRows: number): FileResourcePreview {
  const parsed = JSON.parse(text) as unknown;

  if (Array.isArray(parsed)) {
    const firstRecord = parsed[0];
    return {
      resourceId: '',
      parser: 'json',
      format,
      inferredFormat: format,
      fields:
        firstRecord && typeof firstRecord === 'object' && !Array.isArray(firstRecord)
          ? Object.keys(firstRecord as Record<string, unknown>)
          : [],
      records: parsed.slice(0, maxRows) as Record<string, unknown>[],
      warnings: [],
    };
  }

  if (parsed && typeof parsed === 'object') {
    const rootObject = parsed as Record<string, unknown>;

    if (rootObject.type === 'FeatureCollection' && Array.isArray(rootObject.features)) {
      const features = rootObject.features as Record<string, unknown>[];
      const firstFeature = features[0] ?? {};
      const properties =
        firstFeature.properties && typeof firstFeature.properties === 'object'
          ? (firstFeature.properties as Record<string, unknown>)
          : {};

      return {
        resourceId: '',
        parser: 'json',
        format,
        inferredFormat: format,
        ...(firstFeature.geometry && typeof firstFeature.geometry === 'object'
          ? {
              geometryType: String(
                (firstFeature.geometry as Record<string, unknown>).type ?? ''
              ),
            }
          : {}),
        featureCount: features.length,
        fields: Object.keys(properties),
        records: features.slice(0, maxRows).map((feature) => ({
          type: feature.type,
          properties: feature.properties,
        })),
        rootKeys: Object.keys(rootObject),
        warnings: [],
      };
    }

    return {
      resourceId: '',
      parser: 'json',
      format,
      inferredFormat: format,
      rootKeys: Object.keys(rootObject),
      records: [rootObject],
      warnings: [],
    };
  }

  return {
    resourceId: '',
    parser: 'json',
    format,
    inferredFormat: format,
    previewText: String(parsed),
    warnings: ['JSON icerigi nesne veya dizi degil.'],
  };
}

function previewXmlText(text: string, format: string): FileResourcePreview {
  const compact = text.replace(/\r/g, '').trim();
  const tags = Array.from(new Set(Array.from(compact.matchAll(/<([A-Za-z0-9_:-]+)(\s|>)/g)).map((m) => m[1])))
    .filter(Boolean)
    .slice(0, 20) as string[];

  return {
    resourceId: '',
    parser: 'xml',
    format,
    inferredFormat: format,
    fields: tags,
    previewText: compact.split('\n').slice(0, 20).join('\n'),
    warnings: ['XML preview yapisal olarak sinirlidir; tam parser eklenmedi.'],
  };
}

export async function searchDatasets(
  query: string,
  rows = 5
): Promise<CkanSearchResult> {
  const { data } = await ckanClient.get('/package_search', {
    params: { q: query, rows },
  });

  const mapped: CkanDatasetSummary[] =
    data?.result?.results?.map((pkg: any) => mapDataset(pkg)) ?? [];

  return {
    count: data?.result?.count ?? mapped.length,
    results: mapped,
  };
}

export async function listDatasets(params?: {
  start?: number;
  rows?: number;
  sort?: string;
}): Promise<CkanSearchResult> {
  const { data } = await ckanClient.get('/package_search', {
    params: {
      q: '*:*',
      start: params?.start ?? 0,
      rows: params?.rows ?? 20,
      sort: params?.sort ?? 'metadata_modified desc',
    },
  });

  const mapped: CkanDatasetSummary[] =
    data?.result?.results?.map((pkg: any) => mapDataset(pkg)) ?? [];

  return {
    count: data?.result?.count ?? mapped.length,
    results: mapped,
  };
}

export async function scanCatalogCoverage(params?: {
  maxDatasets?: number;
  pageSize?: number;
  sort?: string;
}): Promise<CatalogCoverageReport> {
  const maxDatasets = Math.max(1, params?.maxDatasets ?? 100);
  const pageSize = Math.max(1, Math.min(params?.pageSize ?? 50, 100));
  const sort = params?.sort ?? 'metadata_modified desc';

  let start = 0;
  let totalDatasets = 0;
  let scannedDatasets = 0;
  let scannedResources = 0;
  let datasetsWithDatastore = 0;
  let datasetsWithDownloadableFiles = 0;
  let datasetsWithLikelyApis = 0;
  let datasetsWithoutSupportedResources = 0;
  const accessMethodCounts: Record<string, number> = {
    datastore: 0,
    'file-download': 0,
    api: 0,
    unknown: 0,
  };
  const formatCounts: Record<string, number> = {};
  const sampleDatasets: CatalogCoverageReport['sampleDatasets'] = [];

  while (scannedDatasets < maxDatasets) {
    const batch = await listDatasets({
      start,
      rows: Math.min(pageSize, maxDatasets - scannedDatasets),
      sort,
    });

    totalDatasets = batch.count;
    if (!batch.results.length) break;

    for (const dataset of batch.results) {
      scannedDatasets += 1;
      scannedResources += dataset.resources.length;

      const methods = new Set<string>();

      for (const resource of dataset.resources) {
        const capabilities = inferResourceCapabilities(resource);
        methods.add(capabilities.recommendedAccessMethod);
        accessMethodCounts[capabilities.recommendedAccessMethod] =
          (accessMethodCounts[capabilities.recommendedAccessMethod] ?? 0) + 1;

        const formatKey = resource.format?.trim().toLowerCase() || 'unknown';
        formatCounts[formatKey] = (formatCounts[formatKey] ?? 0) + 1;
      }

      if (methods.has('datastore')) datasetsWithDatastore += 1;
      if (methods.has('file-download')) datasetsWithDownloadableFiles += 1;
      if (methods.has('api')) datasetsWithLikelyApis += 1;
      if (methods.size === 0 || (methods.size === 1 && methods.has('unknown'))) {
        datasetsWithoutSupportedResources += 1;
      }

      if (sampleDatasets.length < 10) {
        sampleDatasets.push({
          name: dataset.name,
          title: dataset.title,
          ...(dataset.metadataModified
            ? { metadataModified: dataset.metadataModified }
            : {}),
          resourceCount: dataset.resourceCount,
          supportedAccessMethods: Array.from(methods),
        });
      }

      if (scannedDatasets >= maxDatasets) break;
    }

    start += batch.results.length;
    if (batch.results.length < pageSize) break;
  }

  return {
    scannedDatasets,
    totalDatasets,
    scannedResources,
    datasetsWithDatastore,
    datasetsWithDownloadableFiles,
    datasetsWithLikelyApis,
    datasetsWithoutSupportedResources,
    accessMethodCounts,
    formatCounts,
    sampleDatasets,
  };
}

export async function fetchResourcePreview(
  resourceId: string,
  limit = 20
): Promise<{ fields: any[]; records: any[] }> {
  const { data } = await ckanClient.get('/datastore_search', {
    params: { resource_id: resourceId, limit },
  });

  return {
    fields: data?.result?.fields ?? [],
    records: data?.result?.records ?? [],
  };
}

export async function queryDatastoreResource(params: {
  resourceId: string;
  limit?: number;
  offset?: number;
}): Promise<{ fields: any[]; records: any[]; total: number }> {
  const { data } = await ckanClient.get('/datastore_search', {
    params: {
      resource_id: params.resourceId,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
    },
  });

  return {
    fields: data?.result?.fields ?? [],
    records: data?.result?.records ?? [],
    total: data?.result?.total ?? 0,
  };
}

export async function getDatasetByName(name: string): Promise<CkanDatasetDetail | null> {
  const { data } = await ckanClient.get('/package_show', {
    params: { id: name },
  });

  const pkg = data?.result;
  if (!pkg) return null;

  return mapDatasetDetail(pkg);
}

export async function getResourceById(resourceId: string): Promise<CkanResourceSummary | null> {
  const { data } = await ckanClient.get('/resource_show', {
    params: { id: resourceId },
  });

  const resource = data?.result;
  if (!resource) return null;
  return mapResource(resource);
}

export function inferResourceCapabilities(
  resource: CkanResourceSummary
): ResourceCapabilitySummary {
  const format = resource.format?.toLowerCase();
  const url = resource.url?.toLowerCase() ?? '';
  const datastoreQueryable = Boolean(resource.datastoreActive);
  const fileDownloadable = Boolean(
    resource.url &&
      ['csv', 'tsv', 'xls', 'xlsx', 'json', 'geojson', 'xml', 'zip'].some(
        (ext) => format === ext || url.includes(`.${ext}`)
      )
  );
  const likelyApiEndpoint = Boolean(
    resource.resourceType === 'api' ||
      resource.mimetype?.includes('json') ||
      url.includes('/api/') ||
      url.includes('service')
  );

  let recommendedAccessMethod: ResourceCapabilitySummary['recommendedAccessMethod'] =
    'unknown';
  if (datastoreQueryable) {
    recommendedAccessMethod = 'datastore';
  } else if (fileDownloadable) {
    recommendedAccessMethod = 'file-download';
  } else if (likelyApiEndpoint) {
    recommendedAccessMethod = 'api';
  }

  return {
    resourceId: resource.id,
    ...(resource.format ? { format: resource.format } : {}),
    datastoreQueryable,
    fileDownloadable,
    likelyApiEndpoint,
    supportsPreview: datastoreQueryable,
    recommendedAccessMethod,
  };
}

export async function previewFileResource(params: {
  resourceId: string;
  maxRows?: number;
}): Promise<FileResourcePreview> {
  const resource = await getResourceById(params.resourceId);
  if (!resource) {
    throw new Error(`Resource bulunamadi: ${params.resourceId}`);
  }

  if (!resource.url) {
    throw new Error(`Resource URL bilgisi yok: ${params.resourceId}`);
  }

  const format = inferDownloadFormat(resource);
  const maxRows = Math.max(1, Math.min(params.maxRows ?? 10, 50));
  const buffer = await downloadResourceBuffer(resource.url);

  let preview: FileResourcePreview;
  if (['xlsx', 'xls', 'csv', 'tsv'].includes(format)) {
    preview = previewSpreadsheet(buffer, format, maxRows);
  } else if (['json', 'geojson'].includes(format)) {
    preview = previewJsonText(buffer.toString('utf8'), format, maxRows);
  } else if (['xml', 'kml'].includes(format)) {
    preview = previewXmlText(buffer.toString('utf8'), format);
  } else {
    preview = {
      resourceId: params.resourceId,
      parser: 'unsupported',
      ...(resource.format ? { format: resource.format } : {}),
      inferredFormat: format,
      previewText: buffer.toString('utf8', 0, Math.min(buffer.length, 1200)),
      warnings: [`${format} icin ozel parser henuz yok.`],
    };
  }

  return {
    ...preview,
    resourceId: params.resourceId,
    ...(resource.format ? { format: resource.format } : {}),
    inferredFormat: format,
  };
}

export async function profileResource(params: {
  resourceId: string;
  sampleSize?: number;
}): Promise<ResourceProfile> {
  const resource = await getResourceById(params.resourceId);
  if (!resource) {
    throw new Error(`Resource bulunamadi: ${params.resourceId}`);
  }

  const capabilities = inferResourceCapabilities(resource);
  const sampleSize = Math.max(1, Math.min(params.sampleSize ?? 25, 100));

  if (capabilities.datastoreQueryable) {
    const result = await queryDatastoreResource({
      resourceId: params.resourceId,
      limit: sampleSize,
      offset: 0,
    });
    const normalizedRecords = result.records as Record<string, unknown>[];
    const profiled = profileRecords(normalizedRecords);

    return {
      resourceId: params.resourceId,
      accessMethod: 'datastore',
      sampledRecordCount: normalizedRecords.length,
      fieldCount: profiled.fieldCount,
      fields: profiled.fields,
      warnings: [],
    };
  }

  if (capabilities.fileDownloadable) {
    const preview = await previewFileResource({
      resourceId: params.resourceId,
      maxRows: sampleSize,
    });
    const normalizedRecords = preview.records ?? [];
    const profiled = profileRecords(normalizedRecords);

    return {
      resourceId: params.resourceId,
      accessMethod: 'file-download',
      parser: preview.parser,
      inferredFormat: preview.inferredFormat,
      sampledRecordCount: normalizedRecords.length,
      fieldCount: profiled.fieldCount,
      fields: profiled.fields,
      warnings: preview.warnings,
    };
  }

  return {
    resourceId: params.resourceId,
    accessMethod: capabilities.recommendedAccessMethod,
    sampledRecordCount: 0,
    fieldCount: 0,
    fields: [],
    warnings: ['Bu resource icin profil cikarilamadi; desteklenen erisim tipi yok.'],
  };
}

export async function detectGeospatialFields(params: {
  resourceId: string;
  sampleSize?: number;
}): Promise<GeospatialFieldDetection> {
  const resource = await getResourceById(params.resourceId);
  if (!resource) {
    throw new Error(`Resource bulunamadi: ${params.resourceId}`);
  }

  const capability = inferResourceCapabilities(resource);
  const profile = await profileResource({
    resourceId: params.resourceId,
    sampleSize: params.sampleSize ?? 15,
  });

  let geometryType: string | undefined;
  if (capability.fileDownloadable) {
    try {
      const preview = await previewFileResource({
        resourceId: params.resourceId,
        maxRows: params.sampleSize ?? 15,
      });
      geometryType = preview.geometryType;
    } catch {
      // Ignore preview failures; profile-level signals are still usable.
    }
  }

  const coordinateFields = profile.fields
    .filter((field) => field.looksLikeCoordinate)
    .map((field) => field.name);
  const districtFields = profile.fields
    .filter((field) => /(ilce|ilçe|district)/i.test(field.name))
    .map((field) => field.name);
  const neighborhoodFields = profile.fields
    .filter((field) => /(mahalle|neighborhood|semt)/i.test(field.name))
    .map((field) => field.name);
  const addressFields = profile.fields
    .filter((field) => /(adres|address|cadde|sokak|bulvar)/i.test(field.name))
    .map((field) => field.name);
  const geometryFields = profile.fields
    .filter((field) => /(geom|geometry|shape|wkt|polygon|point|linestring)/i.test(field.name))
    .map((field) => field.name);

  const locationSignals = [
    coordinateFields.length ? `Koordinat alanlari: ${coordinateFields.join(', ')}` : '',
    districtFields.length ? `Ilce alanlari: ${districtFields.join(', ')}` : '',
    neighborhoodFields.length ? `Mahalle alanlari: ${neighborhoodFields.join(', ')}` : '',
    addressFields.length ? `Adres alanlari: ${addressFields.join(', ')}` : '',
    geometryFields.length ? `Geometri alanlari: ${geometryFields.join(', ')}` : '',
    geometryType ? `GeoJSON/geometry tipi: ${geometryType}` : '',
  ].filter(Boolean);

  const score =
    (coordinateFields.length ? 3 : 0) +
    (geometryFields.length ? 3 : 0) +
    (geometryType ? 3 : 0) +
    (districtFields.length ? 2 : 0) +
    (neighborhoodFields.length ? 2 : 0) +
    (addressFields.length ? 1 : 0);

  const suitability: GeospatialFieldDetection['suitability'] =
    score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low';

  return {
    resourceId: params.resourceId,
    accessMethod: profile.accessMethod,
    ...(geometryType ? { geometryType } : {}),
    coordinateFields,
    districtFields,
    neighborhoodFields,
    addressFields,
    geometryFields,
    locationSignals,
    suitability,
    warnings: profile.warnings,
  };
}

export async function fetchXlsxRows(url: string): Promise<Record<string, unknown>[]> {
  const buffer = await downloadResourceBuffer(url);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
}

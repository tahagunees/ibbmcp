import { inferResourceCapabilities, profileResource, type CkanDatasetSummary, type CkanResourceSummary } from '../adapters/ckan';
import { extractModifiedTs } from './utils';

export const THEME_DEFINITIONS = {
  mobility: {
    label: 'Ulasim ve Mobilite',
    keywords: ['trafik', 'ulasim', 'ulaşım', 'metro', 'iett', 'otobus', 'otobüs', 'durak', 'hat', 'rayli', 'raylı', 'mobilite', 'gtfs', 'istasyon'],
  },
  social: {
    label: 'Sosyal Hizmetler ve Hanehalki',
    keywords: ['sosyal', 'yardim', 'yardım', 'hane', 'hanehalkı', 'vdy m', 'vdym', 'duygu', 'gelir', 'yasam', 'yaşam', 'kadin', 'kadın', 'genç', 'genc'],
  },
  environment: {
    label: 'Cevre ve Atik',
    keywords: ['cevre', 'çevre', 'atik', 'atık', 'enerji', 'hava', 'supurme', 'süpürme', 'tibbi', 'tıbbi', 'emisyon', 'gemi'],
  },
  emergency: {
    label: 'Itfaiye ve Acil Durum',
    keywords: ['itfaiye', 'yangin', 'yangın', 'acil', 'cankurtaran', 'afet', 'olaylar', 'istasyon', 'arac', 'araç'],
  },
  infrastructure: {
    label: 'Su ve Altyapi',
    keywords: ['iski', 'su', 'altyapi', 'altyapı', 'ariza', 'arıza', 'kanal', 'kesinti', 'temiz su', 'melen'],
  },
  business: {
    label: 'Isletme ve Ticaret',
    keywords: ['isyeri', 'işyeri', 'isletme', 'işletme', 'ruhsat', 'sektor', 'sektör', 'muessese', 'müessese', 'ticaret', 'otopark', 'restoran', 'lokanta', 'pizzaci', 'pizzacı', 'lokasyon', 'rekabet'],
  },
  citizen_services: {
    label: 'Vatandas Hizmetleri ve Basvurular',
    keywords: ['cozum merkezi', 'çözüm merkezi', '153', 'basvuru', 'başvuru', 'memnuniyet', 'hizmet', 'bilgilendirme'],
  },
  green_areas: {
    label: 'Park, Bahce ve Yesil Alan',
    keywords: ['park', 'bahce', 'bahçe', 'yesil', 'yeşil', 'agac', 'ağaç', 'bisiklet', 'mikromobilite'],
  },
  education: {
    label: 'Egitim ve Genclik',
    keywords: ['egitim', 'eğitim', 'universite', 'üniversite', 'ogrenci', 'öğrenci', 'genç', 'genc', 'tech istanbul'],
  },
  demography: {
    label: 'Demografi ve Istatistik',
    keywords: ['nufus', 'nüfus', 'yas', 'yaş', 'cinsiyet', 'medeni hal', 'istatistik', 'tuik', 'tüik'],
  },
} as const;

export type ThemeId = keyof typeof THEME_DEFINITIONS;

export const TURKISH_STOP_WORDS = new Set([
  'acaba', 'ama', 'analiz', 'analizi', 'analizini', 'bana', 'bazli', 'beni', 'bir', 'bu', 'da', 'de', 'daha', 'gibi', 'gore', 'hangi', 'icin', 'için', 'ile', 'ilgili', 'ki', 'mi', 'mu', 'mü', 'nasil', 'nasıl', 'ne', 'neden', 'olan', 'olarak', 'olsun', 'sanki', 'soru', 've', 'veya', 'ya', 'acik', 'açık', 'veri', 'veriler', 'verilerle', 'seti', 'setleri', 'setlerini', 'birlikte', 'kullan', 'kullanmak', 'kullanmaliyim', 'kullanmalıyım'
]);
const NORMALIZED_STOP_WORDS = new Set(Array.from(TURKISH_STOP_WORDS).map((word) => normalizeForSearch(word)));

export const DOMAIN_HINTS: { query: string; keywords: string[] }[] = [
  { query: 'kent lokantalari', keywords: ['kent lokantasi', 'kent lokantası', 'kent lokantalari', 'kent lokantaları'] },
  { query: 'trafik', keywords: ['trafik', 'yogunluk', 'yoğunluk', 'ulasim', 'ulaşım', 'kaza'] },
  { query: 'okul', keywords: ['okul', 'ogrenci', 'öğrenci', 'egitim', 'eğitim'] },
  { query: 'restoran', keywords: ['restoran', 'lokanta', 'pizzaci', 'pizzacı', 'yeme', 'yemek'] },
  { query: 'mahalle', keywords: ['mahalle', 'cadde', 'sokak', 'ilce', 'ilçe', 'semt'] },
  { query: 'nufus', keywords: ['nufus', 'nüfus', 'demografi', 'yas', 'yaş'] },
  { query: 'isyeri', keywords: ['isyeri', 'işyeri', 'ruhsat', 'ticaret', 'isletme', 'işletme'] },
  { query: 'otopark', keywords: ['otopark', 'park', 'ispark', 'ispak'] },
  { query: 'metro', keywords: ['metro', 'durak', 'hat', 'gtfs', 'iett', 'otobus', 'otobüs'] },
  { query: 'cografi', keywords: ['cografi', 'coğrafi', 'harita', 'geojson', 'koordinat'] },
];

export function normalizeForSearch(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsNormalizedTerm(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeForSearch(needle);
  if (!normalizedNeedle) return false;
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(normalizedNeedle)}(?=$|\\s)`, 'u');
  return pattern.test(haystack);
}

export function getThemeIds(): ThemeId[] {
  return Object.keys(THEME_DEFINITIONS) as ThemeId[];
}

export function getThemeLabel(theme: ThemeId): string {
  return THEME_DEFINITIONS[theme].label;
}

export function scoreDatasetForTheme(dataset: CkanDatasetSummary, theme: ThemeId): number {
  const haystack = normalizeForSearch(
    [
      dataset.title,
      dataset.name,
      dataset.notes ?? '',
      dataset.organization?.title ?? dataset.organization?.name ?? '',
      dataset.tags.map((tag) => `${tag.name} ${tag.displayName ?? ''}`).join(' '),
      dataset.resources.map((resource) => `${resource.name} ${resource.format ?? ''}`).join(' '),
    ].join(' ')
  );

  const definition = THEME_DEFINITIONS[theme];
  let score = 0;
  let keywordHits = 0;

  for (const keyword of definition.keywords) {
    if (containsNormalizedTerm(haystack, keyword)) {
      score += 4;
      keywordHits += 1;
    }
  }

  let capabilityScore = 0;
  for (const resource of dataset.resources) {
    const capability = inferResourceCapabilities(resource);
    if (capability.datastoreQueryable) capabilityScore += 1.5;
    else if (capability.fileDownloadable) capabilityScore += 1;
    else if (capability.likelyApiEndpoint) capabilityScore += 0.5;
  }
  score += Math.min(capabilityScore, 8);

  if (dataset.metadataModified) score += 0.5;
  if (keywordHits === 0) score = 0;
  return score;
}

export function inferDatasetThemes(dataset: CkanDatasetSummary): { theme: ThemeId; score: number; label: string }[] {
  return getThemeIds()
    .map((theme) => ({
      theme,
      score: scoreDatasetForTheme(dataset, theme),
      label: getThemeLabel(theme),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function inferQuestionThemes(question: string): { theme: ThemeId; score: number; label: string }[] {
  const normalized = normalizeForSearch(question);

  return getThemeIds()
    .map((theme) => {
      const definition = THEME_DEFINITIONS[theme];
      let score = 0;
      for (const keyword of definition.keywords) {
        if (containsNormalizedTerm(normalized, keyword)) {
          score += 3;
        }
      }

      return {
        theme,
        score,
        label: definition.label,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function extractQuestionTerms(question: string): string[] {
  return Array.from(
    new Set(
      normalizeForSearch(question)
        .split(' ')
        .filter((word) => word.length >= 3 && !NORMALIZED_STOP_WORDS.has(normalizeForSearch(word)))
    )
  );
}

export function buildAnalysisQueries(question: string): string[] {
  const normalized = normalizeForSearch(question);
  const terms = extractQuestionTerms(question);
  const queries: string[] = [];

  if (normalized.length >= 3) {
    queries.push(normalized.slice(0, 120));
  }

  for (const hint of DOMAIN_HINTS) {
    if (hint.keywords.some((keyword) => normalized.includes(keyword))) {
      queries.push(hint.query);
    }
  }

  for (const term of terms.slice(0, 4)) {
    queries.push(term);
  }

  return Array.from(new Set(queries)).slice(0, 6);
}

export function scoreDatasetForQuestion(
  dataset: CkanDatasetSummary,
  questionTerms: string[],
  intent: string,
  matchedQueries: string[]
): number {
  const normalizedQuestionTerms = questionTerms.map((term) => normalizeForSearch(term));
  const isKentLokantasiQuestion =
    normalizedQuestionTerms.includes('kent') &&
    normalizedQuestionTerms.some((term) => ['lokantasi', 'lokantası', 'lokantalari', 'lokantaları', 'lokanta'].includes(term));
  const isLocationQuestion = normalizedQuestionTerms.some((term) =>
    ['konum', 'konumlari', 'konumları', 'lokasyon', 'lokasyonu', 'bolge', 'bölge', 'mahalle'].includes(term)
  );
  const haystack = normalizeForSearch(
    [
      dataset.title,
      dataset.name,
      dataset.notes ?? '',
      dataset.tags.map((tag) => `${tag.name} ${tag.displayName ?? ''}`).join(' '),
      dataset.resources.map((resource) => `${resource.name} ${resource.format ?? ''}`).join(' '),
    ].join(' ')
  );

  let score = 0;
  const exactDomainBoosts = [
    {
      active: isKentLokantasiQuestion,
      terms: ['kent lokantalari', 'kent lokantaları', 'kent lokantasi', 'kent lokantası'],
      boost: 45,
    },
    {
      active: isKentLokantasiQuestion && isLocationQuestion,
      terms: ['konum', 'konumlari', 'konumları', 'lokasyon'],
      boost: 28,
    },
  ];

  for (const boost of exactDomainBoosts) {
    if (boost.active && boost.terms.some((term) => haystack.includes(normalizeForSearch(term)))) {
      score += boost.boost;
    }
  }

  if (
    isKentLokantasiQuestion &&
    !['kent lokantalari', 'kent lokantaları', 'kent lokantasi', 'kent lokantası'].some((term) =>
      haystack.includes(normalizeForSearch(term))
    )
  ) {
    score -= 35;
  }

  for (const term of questionTerms) {
    if (containsNormalizedTerm(haystack, term)) score += 4;
  }

  const queryWeights =
    intent === 'decision-support'
      ? {
          'kent lokantalari': 20, trafik: 6, okul: 6, isyeri: 6, restoran: 5, nufus: 5, metro: 4, cografi: 4, mahalle: 2,
        }
      : {};

  for (const query of matchedQueries) {
    const normalizedQuery = normalizeForSearch(query);
    score += queryWeights[normalizedQuery as keyof typeof queryWeights] ?? 3;
  }

  if (intent === 'decision-support') {
    const strategicTerms = [
      'kent lokantalari', 'kent lokantaları', 'kent lokantasi', 'kent lokantası',
      'trafik', 'okul', 'ogrenci', 'öğrenci', 'isyeri', 'işyeri', 'isletme', 'işletme',
      'ulasim', 'ulaşım', 'restoran', 'lokanta', 'nufus', 'nüfus', 'mahalle', 'cadde',
    ];
    const strategicHits = strategicTerms.filter((term) => containsNormalizedTerm(haystack, term));
    score += strategicHits.length * 2;
  }

  for (const resource of dataset.resources) {
    const capability = inferResourceCapabilities(resource);
    if (capability.datastoreQueryable) score += 3;
    else if (capability.fileDownloadable) score += 2;
    else if (capability.likelyApiEndpoint) score += 1;
  }

  if (dataset.metadataModified) score += 1;
  if (dataset.tags.length > 0) score += 0.5;

  return score;
}

export function pickBestResourceForAnalysis(resources: CkanResourceSummary[]): CkanResourceSummary | undefined {
  return resources
    .slice()
    .sort((a, b) => {
      const capA = inferResourceCapabilities(a);
      const capB = inferResourceCapabilities(b);

      const scoreA =
        (capA.datastoreQueryable ? 30 : 0) +
        (capA.fileDownloadable ? 20 : 0) +
        (capA.likelyApiEndpoint ? 10 : 0) +
        extractModifiedTs(a);
      const scoreB =
        (capB.datastoreQueryable ? 30 : 0) +
        (capB.fileDownloadable ? 20 : 0) +
        (capB.likelyApiEndpoint ? 10 : 0) +
        extractModifiedTs(b);

      return scoreB - scoreA;
    })[0];
}

export function inferQuestionIntent(question: string) {
  const normalized = normalizeForSearch(question);

  if (['uygun', 'acmak', 'açmak', 'nerede', 'lokasyon', 'cadde', 'mahalle'].some((word) => normalized.includes(word))) {
    return 'decision-support';
  }

  if (['kalite', 'uygun mu', 'profil', 'null', 'eksik'].some((word) => normalized.includes(word))) {
    return 'quality-check';
  }

  if (['trend', 'degisim', 'değişim', 'zaman', 'yillara', 'yıllara'].some((word) => normalized.includes(word))) {
    return 'trend-analysis';
  }

  return 'dataset-discovery';
}

export function summarizeProfileInsights(profile: Awaited<ReturnType<typeof profileResource>>): string[] {
  const dateFields = profile.fields.filter((field) => field.looksLikeDate).map((field) => field.name);
  const coordinateFields = profile.fields
    .filter((field) => field.looksLikeCoordinate)
    .map((field) => field.name);
  const sparseFields = profile.fields
    .filter((field) => field.nullRatio >= 0.4)
    .map((field) => `${field.name} (%${Math.round(field.nullRatio * 100)} bos)`);
  const dominantTypes = profile.fields
    .slice(0, 5)
    .map((field) => `${field.name}: ${field.detectedTypes.join('/') || 'bilinmiyor'}`);

  const insights = [
    `Orneklenen kayit sayisi: ${profile.sampledRecordCount}`,
    `Alan sayisi: ${profile.fieldCount}`,
    dominantTypes.length ? `Tip ozetleri: ${dominantTypes.join(', ')}` : '',
    dateFields.length ? `Tarih benzeri alanlar: ${dateFields.join(', ')}` : '',
    coordinateFields.length ? `Koordinat benzeri alanlar: ${coordinateFields.join(', ')}` : '',
    sparseFields.length ? `Yuksek bosluklu alanlar: ${sparseFields.join(', ')}` : '',
    profile.warnings.length ? `Uyarilar: ${profile.warnings.join(' | ')}` : '',
  ].filter(Boolean);

  return insights;
}

export function computeConfidence(params: {
  candidateCount: number;
  selectedCapability: ReturnType<typeof inferResourceCapabilities> | undefined;
  profiledRecordCount: number;
  warnings: string[];
}) {
  let score = 0;
  if (params.candidateCount >= 3) score += 1;
  if (params.selectedCapability?.datastoreQueryable) score += 2;
  else if (params.selectedCapability?.fileDownloadable) score += 1;
  if (params.profiledRecordCount > 0) score += 2;
  if (params.profiledRecordCount >= 10) score += 1;
  if (params.warnings.length > 0) score -= 1;

  if (score >= 5) return 'yuksek';
  if (score >= 3) return 'orta';
  return 'dusuk';
}

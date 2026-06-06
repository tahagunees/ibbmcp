import {
  getDatasetByName,
  inferResourceCapabilities,
  listDatasets,
  profileResource,
  searchDatasets,
  type CkanDatasetSummary,
} from '../adapters/ckan';
import {
  buildAnalysisQueries,
  computeConfidence,
  extractQuestionTerms,
  inferDatasetThemes,
  inferQuestionIntent,
  inferQuestionThemes,
  pickBestResourceForAnalysis,
  scoreDatasetForQuestion,
  normalizeForSearch,
  summarizeProfileInsights,
} from '../mcp/analysisUtils';
import { compactText, summarizeDataset, summarizeResource } from '../mcp/utils';

export async function searchDatasetCatalog(query: string, rows = 8) {
  const result = await searchDatasets(query, rows);
  return {
    query,
    total: result.count,
    returned: result.results.length,
    datasets: result.results.map((dataset) => summarizeDataset(dataset)),
  };
}

export async function listRecentDatasetCatalog(start = 0, rows = 12) {
  const result = await listDatasets({
    start,
    rows,
    sort: 'metadata_modified desc',
  });

  return {
    total: result.count,
    start,
    rows,
    sort: 'metadata_modified desc',
    datasets: result.results.map((dataset) => summarizeDataset(dataset)),
  };
}

export async function getDatasetMetadata(datasetName: string) {
  const dataset = await getDatasetByName(datasetName);
  if (!dataset) return null;

  return {
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
  };
}

export async function suggestRelatedDatasetsForQuestion(args: {
  question: string;
  maxDatasets?: number;
  maxThemes?: number;
}) {
  const queries = buildAnalysisQueries(args.question);
  const questionTerms = extractQuestionTerms(args.question);
  const intent = inferQuestionIntent(args.question);
  const questionThemes = inferQuestionThemes(args.question).slice(0, args.maxThemes ?? 3);

  const searchResults = await Promise.all(
    queries.map(async (query) => {
      try {
        const result = await searchDatasets(query, 6);
        return { query, result };
      } catch {
        return { query, result: { count: 0, results: [] as CkanDatasetSummary[] } };
      }
    })
  );

  const merged = new Map<string, { dataset: CkanDatasetSummary; matchedQueries: Set<string> }>();
  for (const { query, result } of searchResults) {
    for (const dataset of result.results) {
      if (!merged.has(dataset.name)) {
        merged.set(dataset.name, { dataset, matchedQueries: new Set([query]) });
      } else {
        merged.get(dataset.name)!.matchedQueries.add(query);
      }
    }
  }

  const ranked = Array.from(merged.values())
    .map(({ dataset, matchedQueries }) => {
      const datasetThemes = inferDatasetThemes(dataset).slice(0, 3);
      const themeOverlap = datasetThemes
        .filter((themeInfo) => questionThemes.some((qTheme) => qTheme.theme === themeInfo.theme))
        .reduce((sum, item) => sum + item.score, 0);
      const cappedThemeOverlap = Math.min(themeOverlap, 30);
      const normalizedTerms = questionTerms.map((term) => normalizeForSearch(term));
      const isKentLokantasiQuestion =
        normalizedTerms.includes('kent') &&
        normalizedTerms.some((term) => ['lokantasi', 'lokantası', 'lokantalari', 'lokantaları', 'lokanta'].includes(term));
      const datasetText = normalizeForSearch(`${dataset.title} ${dataset.name}`);
      const primaryDomainBoost =
        isKentLokantasiQuestion &&
        ['kent lokantalari', 'kent lokantaları', 'kent lokantasi', 'kent lokantası'].some((term) =>
          datasetText.includes(normalizeForSearch(term))
        )
          ? 200
          : 0;

      return {
        dataset,
        matchedQueries: Array.from(matchedQueries),
        datasetThemes,
        score:
          scoreDatasetForQuestion(dataset, questionTerms, intent, Array.from(matchedQueries)) +
          primaryDomainBoost +
          cappedThemeOverlap,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    return {
      question: args.question,
      intent,
      queries,
      inferredThemes: questionThemes,
      message: 'Soruyla eslesen ilgili veri seti bulunamadi.',
      recommendedBundle: [],
      groupedByTheme: [],
      bundleRationale: [],
    };
  }

  const topCandidates = ranked.filter((item) => item.score >= 8).slice(0, args.maxDatasets ?? 6);
  const enriched = await Promise.all(
    topCandidates.map(async (candidate) => {
      const detail = await getDatasetByName(candidate.dataset.name);
      const dataset = detail ?? candidate.dataset;
      const bestResource = pickBestResourceForAnalysis(dataset.resources);
      const capability = bestResource ? inferResourceCapabilities(bestResource) : undefined;

      return {
        ...candidate,
        dataset,
        bestResource,
        capability,
      };
    })
  );

  const groupedByTheme = questionThemes.map((themeInfo) => ({
    theme: themeInfo.theme,
    label: themeInfo.label,
    score: themeInfo.score,
    datasets: enriched
      .filter((item) => item.datasetThemes.some((datasetTheme) => datasetTheme.theme === themeInfo.theme))
      .slice(0, 3)
      .map((item) => ({
        title: item.dataset.title,
        name: item.dataset.name,
        matchedQueries: item.matchedQueries,
        datasetThemes: item.datasetThemes,
        suggestedResource: item.bestResource
          ? {
              id: item.bestResource.id,
              name: item.bestResource.name,
              format: item.bestResource.format,
              accessMethod: item.capability?.recommendedAccessMethod,
            }
          : null,
      })),
  }));

  const bundleRationale = [
    questionThemes.some((theme) => theme.theme === 'business')
      ? 'Isletme veya lokasyon sorularinda isyeri ve ticaret veri setleri temel bir bilesendir.'
      : '',
    questionThemes.some((theme) => theme.theme === 'mobility')
      ? 'Ulasim ve trafik verileri talep yogunlugu ve erisilebilirlik analizi icin destekleyicidir.'
      : '',
    questionThemes.some((theme) => theme.theme === 'education')
      ? 'Egitim veya ogrenci temasi, hedef kitleye yakinlik analizi icin anlamli olabilir.'
      : '',
    questionThemes.some((theme) => theme.theme === 'social')
      ? 'Sosyal ve hanehalki verileri bolgesel profil cikarmak icin tamamlayici bir katman sunar.'
      : '',
  ].filter(Boolean);

  return {
    question: args.question,
    intent,
    queries,
    inferredThemes: questionThemes,
    recommendedBundle: enriched.filter((item) => item.score >= 8).map((item) => ({
      dataset: {
        title: item.dataset.title,
        name: item.dataset.name,
        score: Number(item.score.toFixed(2)),
        matchedQueries: item.matchedQueries,
        themes: item.datasetThemes,
        notes: compactText(item.dataset.notes, ''),
      },
      suggestedResource: item.bestResource
        ? {
            id: item.bestResource.id,
            name: item.bestResource.name,
            format: item.bestResource.format,
            accessMethod: item.capability?.recommendedAccessMethod,
          }
        : null,
    })),
    groupedByTheme,
    bundleRationale,
  };
}

export async function analyzeQuestion(args: {
  question: string;
  maxDatasets?: number;
  sampleSize?: number;
}) {
  const queries = buildAnalysisQueries(args.question);
  const questionTerms = extractQuestionTerms(args.question);
  const intent = inferQuestionIntent(args.question);

  const searchResults = await Promise.all(
    queries.map(async (query) => {
      try {
        const result = await searchDatasets(query, 5);
        return { query, result };
      } catch {
        return { query, result: { count: 0, results: [] as CkanDatasetSummary[] } };
      }
    })
  );

  const merged = new Map<string, { dataset: CkanDatasetSummary; matchedQueries: Set<string> }>();
  for (const { query, result } of searchResults) {
    for (const dataset of result.results) {
      if (!merged.has(dataset.name)) {
        merged.set(dataset.name, { dataset, matchedQueries: new Set([query]) });
      } else {
        merged.get(dataset.name)!.matchedQueries.add(query);
      }
    }
  }

  const ranked = Array.from(merged.values())
    .map(({ dataset, matchedQueries }) => ({
      dataset,
      matchedQueries: Array.from(matchedQueries),
      score: scoreDatasetForQuestion(dataset, questionTerms, intent, Array.from(matchedQueries)),
    }))
    .sort((a, b) => b.score - a.score);

  const selectedCandidates = ranked.filter((item) => item.score >= 8).slice(0, args.maxDatasets ?? 3);

  if (!selectedCandidates.length) {
    return {
      question: args.question,
      intent,
      queries,
      confidence: 'dusuk',
      message: 'Soruyla eslesen veri seti bulunamadi.',
      selectedDataset: null,
      selectedResource: null,
      analysisSummary: null,
      alternatives: [],
    };
  }

  const enrichedCandidates = await Promise.all(
    selectedCandidates.map(async ({ dataset, score, matchedQueries }) => {
      const detail = await getDatasetByName(dataset.name);
      const sourceDataset = detail ?? dataset;
      const selectedResource = pickBestResourceForAnalysis(sourceDataset.resources);
      const selectedCapability = selectedResource ? inferResourceCapabilities(selectedResource) : undefined;

      let profile: Awaited<ReturnType<typeof profileResource>> | undefined;
      let profileError: string | undefined;

      if (selectedResource) {
        try {
          profile = await profileResource({
            resourceId: selectedResource.id,
            sampleSize: args.sampleSize ?? 10,
          });
        } catch (error) {
          profileError = error instanceof Error ? error.message : 'Profil alinamadi';
        }
      }

      return {
        dataset: sourceDataset,
        score,
        matchedQueries,
        selectedResource,
        selectedCapability,
        profile,
        profileError,
      };
    })
  );

  const best = enrichedCandidates[0]!;
  const bestInsights = best.profile ? summarizeProfileInsights(best.profile) : [];
  const limitations = [
    best.selectedCapability?.recommendedAccessMethod === 'api'
      ? 'Secilen resource API tipinde; bu kaynak icin ozel adapter henuz eklenmedi.'
      : '',
    best.selectedCapability?.recommendedAccessMethod === 'unknown'
      ? 'Secilen resource desteklenen bir erisim tipine net dusmuyor.'
      : '',
    best.profileError ? `Profil alinirken hata: ${best.profileError}` : '',
    best.profile?.warnings?.length ? best.profile.warnings.join(' | ') : '',
  ].filter(Boolean);

  const decisionHints = [
    intent === 'decision-support'
      ? 'Bu soru karar destek sinifinda; tek veri seti yerine birden fazla veri setinin birlikte kullanilmasi gerekebilir.'
      : '',
    best.profile?.fields.some((field) => field.looksLikeCoordinate)
      ? 'Secilen kaynakta koordinat benzeri alanlar var; cografi analiz icin uygun bir baslangic noktasi olabilir.'
      : '',
    best.profile?.fields.some((field) => field.looksLikeDate)
      ? 'Secilen kaynak zaman boyutu icerebilir; trend analizi icin kullanilabilir.'
      : '',
    best.profile?.sampledRecordCount === 0
      ? 'Kaynak profillenemedi; cevap metadata agirlikli degerlendirilmeli.'
      : '',
  ].filter(Boolean);

  const confidence = computeConfidence({
    candidateCount: enrichedCandidates.length,
    selectedCapability: best.selectedCapability,
    profiledRecordCount: best.profile?.sampledRecordCount ?? 0,
    warnings: limitations,
  });

  return {
    question: args.question,
    intent,
    queries,
    confidence,
    selectedDataset: {
      title: best.dataset.title,
      name: best.dataset.name,
      organization: best.dataset.organization?.title ?? best.dataset.organization?.name,
      metadataModified: best.dataset.metadataModified,
      score: Number(best.score.toFixed(2)),
      matchedQueries: best.matchedQueries,
      notes: compactText(best.dataset.notes, ''),
    },
    selectedResource: best.selectedResource ? summarizeResource(best.selectedResource) : null,
    analysisSummary: {
      whyThisDataset: [
        'Soru terimleri ile dataset basligi/aciklamasi arasinda eslesme bulundu.',
        best.selectedCapability?.datastoreQueryable
          ? 'Datastore destekledigi icin sorgulanabilirlik yuksek.'
          : best.selectedCapability?.fileDownloadable
            ? 'Indirilebilir dosya oldugu icin parser tabanli analiz mumkun.'
            : 'Kaynak metadata duzeyinde degerlendirildi.',
      ],
      profileInsights: bestInsights,
      decisionHints,
      limitations,
    },
    alternatives: enrichedCandidates.filter((candidate) => candidate.score >= 8).slice(1).map((candidate) => ({
      dataset: {
        title: candidate.dataset.title,
        name: candidate.dataset.name,
        score: Number(candidate.score.toFixed(2)),
        matchedQueries: candidate.matchedQueries,
      },
      selectedResource: candidate.selectedResource
        ? {
            id: candidate.selectedResource.id,
            name: candidate.selectedResource.name,
            format: candidate.selectedResource.format,
            accessMethod: candidate.selectedCapability?.recommendedAccessMethod,
          }
        : null,
    })),
  };
}

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchDatasets, getDatasetByName, profileResource, inferResourceCapabilities, type CkanDatasetSummary } from '../../adapters/ckan';
import { jsonToolOutput, summarizeResource, compactText } from '../utils';
import { buildAnalysisQueries, extractQuestionTerms, inferQuestionIntent, scoreDatasetForQuestion, pickBestResourceForAnalysis, summarizeProfileInsights, computeConfidence, inferQuestionThemes, inferDatasetThemes, normalizeForSearch } from '../analysisUtils';

export function registerAnalysisTools(server: McpServer) {
  server.registerTool(
    'suggest_related_datasets',
    {
      title: 'Ilgili veri setlerini oner',
      description: 'Kullanicinin sorusuna gore birlikte kullanilabilecek veri setlerini ve tema bazli analiz paketlerini onerir.',
      inputSchema: {
        question: z.string().min(5),
        maxDatasets: z.number().int().min(3).max(12).default(6).optional(),
        maxThemes: z.number().int().min(1).max(4).default(3).optional(),
      },
    },
    async (args: { question: string; maxDatasets: number | undefined; maxThemes: number | undefined }) => {
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
        return jsonToolOutput({
          question: args.question,
          intent,
          queries,
          inferredThemes: questionThemes,
          message: 'Soruyla eslesen ilgili veri seti bulunamadi.',
        });
      }

      const topCandidates = ranked.slice(0, args.maxDatasets ?? 6);

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
          ? 'Isletme veya lokasyon sorularinda isyeri ve ticaret veri setleri temel bile sendir.'
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

      return jsonToolOutput({
        question: args.question,
        intent,
        queries,
        inferredThemes: questionThemes,
        recommendedBundle: enriched.map((item) => ({
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
      });
    }
  );

  server.registerTool(
    'assess_dataset_fitness',
    {
      title: 'Veri seti uygunlugunu degerlendir',
      description: 'Belirli bir veri setinin kullanici sorusu icin ne kadar uygun oldugunu skorlar ve gerekceli bir degerlendirme uretir.',
      inputSchema: {
        question: z.string().min(5),
        datasetName: z.string().min(2),
        sampleSize: z.number().int().min(1).max(25).default(8).optional(),
      },
    },
    async (args: { question: string; datasetName: string; sampleSize: number | undefined }) => {
      const queries = buildAnalysisQueries(args.question);
      const questionTerms = extractQuestionTerms(args.question);
      const intent = inferQuestionIntent(args.question);
      const questionThemes = inferQuestionThemes(args.question).slice(0, 4);

      const dataset = await getDatasetByName(args.datasetName);
      if (!dataset) {
        return jsonToolOutput({
          question: args.question,
          datasetName: args.datasetName,
          message: 'Veri seti bulunamadi.',
          fitnessLevel: 'dusuk',
        });
      }

      const searchResults = await Promise.all(
        queries.map(async (query) => {
          try {
            const result = await searchDatasets(query, 8);
            return { query, found: result.results.some((item) => item.name === dataset.name) };
          } catch {
            return { query, found: false };
          }
        })
      );

      const matchedQueries = searchResults.filter((item) => item.found).map((item) => item.query);
      const datasetThemes = inferDatasetThemes(dataset).slice(0, 5);
      const bestResource = pickBestResourceForAnalysis(dataset.resources);
      const capability = bestResource ? inferResourceCapabilities(bestResource) : undefined;

      let profile: Awaited<ReturnType<typeof profileResource>> | undefined;
      let profileError: string | undefined;
      if (bestResource) {
        try {
          profile = await profileResource({
            resourceId: bestResource.id,
            sampleSize: args.sampleSize ?? 8,
          });
        } catch (error) {
          profileError = error instanceof Error ? error.message : 'Profil alinamadi';
        }
      }

      const questionScore = scoreDatasetForQuestion(dataset, questionTerms, intent, matchedQueries);
      const themeOverlapScore = datasetThemes
        .filter((themeInfo) => questionThemes.some((questionTheme) => questionTheme.theme === themeInfo.theme))
        .reduce((sum, item) => sum + item.score, 0);
      const profileSupportScore = profile
        ? [
            profile.sampledRecordCount > 0 ? 8 : 0,
            profile.fields.some((field) => field.looksLikeCoordinate) ? 6 : 0,
            profile.fields.some((field) => field.looksLikeDate) ? 4 : 0,
            profile.fields.some((field) => field.nullRatio < 0.2) ? 3 : 0,
          ].reduce((sum, item) => sum + item, 0)
        : 0;
      const capabilitySupportScore =
        capability?.datastoreQueryable
          ? 12
          : capability?.fileDownloadable
            ? 8
            : capability?.likelyApiEndpoint
              ? 5
              : 0;

      const rawFitness = questionScore + themeOverlapScore + profileSupportScore + capabilitySupportScore;
      const fitnessScore = Math.min(100, Math.max(0, Math.round(rawFitness)));
      const fitnessLevel =
        fitnessScore >= 70 ? 'yuksek' : fitnessScore >= 40 ? 'orta' : 'dusuk';

      const strengths = [
        matchedQueries.length > 0 ? `Sorgu eslesmeleri bulundu: ${matchedQueries.join(', ')}` : '',
        datasetThemes.length > 0
          ? `Tema uyumu: ${datasetThemes.slice(0, 3).map((theme) => `${theme.label} (${theme.score})`).join(', ')}`
          : '',
        capability?.datastoreQueryable ? 'En uygun resource datastore destekliyor.' : '',
        capability?.fileDownloadable ? 'En uygun resource indirilebilir ve parser ile okunabilir.' : '',
        profile?.fields.some((field) => field.looksLikeCoordinate)
          ? 'Profilde koordinat benzeri alanlar bulundu; mekansal analiz icin degerli olabilir.'
          : '',
        profile?.fields.some((field) => field.looksLikeDate)
          ? 'Profilde tarih benzeri alanlar bulundu; trend veya zaman analizi icin destek sunabilir.'
          : '',
      ].filter(Boolean);

      const risks = [
        matchedQueries.length === 0 ? 'Veri seti dogrudan query eslesmesi vermedi; uygunluk daha cok metadata ve tema seviyesinde degerlendirildi.' : '',
        !bestResource ? 'Analiz icin secilebilir bir resource bulunamadi.' : '',
        capability?.recommendedAccessMethod === 'unknown' ? 'Resource erisim tipi net degil.' : '',
        capability?.recommendedAccessMethod === 'api' ? 'API tipi resource icin ozel adapter henuz bulunmuyor.' : '',
        profileError ? `Profil alinirken hata olustu: ${profileError}` : '',
        profile?.sampledRecordCount === 0 ? 'Resource profili ornek kayit dondurmedi.' : '',
        profile?.warnings?.length ? profile.warnings.join(' | ') : '',
      ].filter(Boolean);

      const recommendedUsage = [
        intent === 'decision-support'
          ? 'Bu soru karar destek turunde oldugu icin veri seti tek basina degil, ilgili diger tema veri setleriyle birlikte kullanilmalidir.'
          : '',
        fitnessLevel === 'yuksek'
          ? 'Bu veri seti ilgili soruda birincil veri kaynagi olarak kullanilabilir.'
          : '',
        fitnessLevel === 'orta'
          ? 'Bu veri seti tamamlayici kaynak olarak kullanilmaya daha uygundur.'
          : '',
        fitnessLevel === 'dusuk'
          ? 'Bu veri seti bu soru icin ancak yardimci veya baglamsal bilgi saglayabilir.'
          : '',
      ].filter(Boolean);

      return jsonToolOutput({
        question: args.question,
        dataset: {
          title: dataset.title,
          name: dataset.name,
          organization: dataset.organization?.title ?? dataset.organization?.name,
          metadataModified: dataset.metadataModified,
          notes: compactText(dataset.notes, ''),
        },
        fitnessLevel,
        fitnessScore,
        evaluation: {
          intent,
          inferredQuestionThemes: questionThemes,
          matchedQueries,
          datasetThemes,
        },
        selectedResource: bestResource ? summarizeResource(bestResource) : null,
        profileSummary: profile
          ? {
              sampledRecordCount: profile.sampledRecordCount,
              fieldCount: profile.fieldCount,
              insights: summarizeProfileInsights(profile),
            }
          : null,
        strengths,
        risks,
        recommendedUsage,
      });
    }
  );

  server.registerTool(
    'analyze_open_data_question',
    {
      title: 'Acik veri sorusunu analiz et',
      description: 'Kullanicinin dogal dil sorusuna uygun veri setlerini bulur, en uygun resource’u secer, profil cikarir ve guven notlu bir analiz ozeti uretir.',
      inputSchema: {
        question: z.string().min(5),
        maxDatasets: z.number().int().min(1).max(5).default(3).optional(),
        sampleSize: z.number().int().min(1).max(50).default(10).optional(),
      },
    },
    async (args: { question: string; maxDatasets: number | undefined; sampleSize: number | undefined }) => {
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

      const selectedCandidates = ranked.slice(0, args.maxDatasets ?? 3);

      if (!selectedCandidates.length) {
        return jsonToolOutput({
          question: args.question,
          intent,
          queries,
          confidence: 'dusuk',
          message: 'Soruyla eslesen veri seti bulunamadi.',
        });
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

          return { dataset: sourceDataset, score, matchedQueries, selectedResource, selectedCapability, profile, profileError };
        })
      );

      const best = enrichedCandidates[0]!;
      const bestInsights = best.profile ? summarizeProfileInsights(best.profile) : [];
      const limitations = [
        best.selectedCapability?.recommendedAccessMethod === 'api' ? 'Secilen resource API tipinde; bu kaynak icin ozel adapter henuz eklenmedi.' : '',
        best.selectedCapability?.recommendedAccessMethod === 'unknown' ? 'Secilen resource desteklenen bir erisim tipine net dusmuyor.' : '',
        best.profileError ? `Profil alinirken hata: ${best.profileError}` : '',
        best.profile?.warnings?.length ? best.profile.warnings.join(' | ') : '',
      ].filter(Boolean);

      const decisionHints = [
        intent === 'decision-support' ? 'Bu soru karar destek sinifinda; tek veri seti yerine birden fazla veri setinin birlikte kullanilmasi gerekebilir.' : '',
        best.profile?.fields.some((field) => field.looksLikeCoordinate) ? 'Secilen kaynakta koordinat benzeri alanlar var; cografi analiz icin uygun bir baslangic noktasi olabilir.' : '',
        best.profile?.fields.some((field) => field.looksLikeDate) ? 'Secilen kaynak zaman boyutu icerebilir; trend analizi icin kullanilabilir.' : '',
        best.profile?.sampledRecordCount === 0 ? 'Kaynak profillenemedi; cevap metadata agirlikli degerlendirilmeli.' : '',
      ].filter(Boolean);

      const confidence = computeConfidence({
        candidateCount: enrichedCandidates.length,
        selectedCapability: best.selectedCapability,
        profiledRecordCount: best.profile?.sampledRecordCount ?? 0,
        warnings: limitations,
      });

      return jsonToolOutput({
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
            best.selectedCapability?.datastoreQueryable ? 'Datastore destekledigi icin sorgulanabilirlik yuksek.' : best.selectedCapability?.fileDownloadable ? 'Indirilebilir dosya oldugu icin parser tabanli analiz mumkun.' : 'Kaynak metadata duzeyinde degerlendirildi.',
          ],
          profileInsights: bestInsights,
          decisionHints,
          limitations,
        },
        alternatives: enrichedCandidates.slice(1).map((candidate) => ({
          dataset: {
            title: candidate.dataset.title,
            name: candidate.dataset.name,
            score: Number(candidate.score.toFixed(2)),
            matchedQueries: candidate.matchedQueries,
          },
          selectedResource: candidate.selectedResource ? {
            id: candidate.selectedResource.id,
            name: candidate.selectedResource.name,
            format: candidate.selectedResource.format,
            accessMethod: candidate.selectedCapability?.recommendedAccessMethod,
          } : null,
        })),
      });
    }
  );
}

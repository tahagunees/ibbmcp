import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getIsparkParks, getIsparkParkDetail } from '../../adapters/ispark';
import { getGoogleTransitPlan } from '../../adapters/transitPlanner';
import { getDatasetByName, fetchXlsxRows, searchDatasets, fetchResourcePreview } from '../../adapters/ckan';
import { getLatestDamOccupancy } from '../../adapters/dams';
import { getAirQualityForStation } from '../../adapters/airQuality';
import { toolOutput, normalizeCoord, pickNewestResource, extractYearMonth, makeDatasetLine } from '../utils';
import { config } from '../../config';

function buildGoogleDirectionsUrl(params: {
  origin: string;
  destination: string;
  mode: 'transit' | 'driving' | 'walking' | 'bicycling';
}) {
  const q = new URLSearchParams({
    api: '1',
    origin: params.origin,
    destination: params.destination,
    travelmode: params.mode,
  });
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

function formatTransitSteps(
  steps: {
    mode: string;
    instruction: string;
    lineName?: string;
    vehicleType?: string;
    departureStop?: string;
    arrivalStop?: string;
    numStops?: number;
    durationText?: string;
  }[]
) {
  if (!steps.length) {
    return 'Canli adim bilgisi bulunamadi.';
  }

  return steps
    .map((s, i) => {
      if (s.mode === 'TRANSIT') {
        const line = s.lineName ? `${s.lineName}` : 'hat bilgisi yok';
        const vehicle = s.vehicleType ? ` (${s.vehicleType})` : '';
        const dep = s.departureStop ? ` | Binis: ${s.departureStop}` : '';
        const arr = s.arrivalStop ? ` | Inis: ${s.arrivalStop}` : '';
        const stops = typeof s.numStops === 'number' ? ` | Durak: ${s.numStops}` : '';
        const dur = s.durationText ? ` | Sure: ${s.durationText}` : '';
        return `${i + 1}. ${line}${vehicle}${dep}${arr}${stops}${dur}`;
      }

      const dur = s.durationText ? ` | Sure: ${s.durationText}` : '';
      return `${i + 1}. Yuru: ${s.instruction || 'Yuruyus adimi'}${dur}`;
    })
    .join('\n');
}

export function registerDomainTools(server: McpServer) {
  server.registerTool(
    'ispark_otopark_ara',
    {
      title: 'ISPARK otopark ara',
      description: 'ISPARK canli otopark listesinden ilce, isim veya bos kapasiteye gore filtreli sonuc verir.',
      inputSchema: {
        ilce: z.string().optional(),
        adArama: z.string().optional(),
        sadeceAcik: z.boolean().default(true).optional(),
        minBosKapasite: z.number().int().min(0).default(1).optional(),
        limit: z.number().int().min(1).max(50).default(10).optional(),
      },
    },
    async (args: { ilce: string | undefined; adArama: string | undefined; sadeceAcik: boolean | undefined; minBosKapasite: number | undefined; limit: number | undefined }) => {
      const rows = await getIsparkParks();
      const ilce = args.ilce?.toLocaleLowerCase('tr-TR');
      const adArama = args.adArama?.toLocaleLowerCase('tr-TR');
      const sadeceAcik = args.sadeceAcik ?? true;
      const minBos = args.minBosKapasite ?? 1;

      const filtered = rows
        .filter((p) => (sadeceAcik ? p.isOpen === 1 : true))
        .filter((p) => p.emptyCapacity >= minBos)
        .filter((p) => (ilce ? p.district.toLocaleLowerCase('tr-TR').includes(ilce) : true))
        .filter((p) => (adArama ? p.parkName.toLocaleLowerCase('tr-TR').includes(adArama) : true))
        .sort((a, b) => b.emptyCapacity - a.emptyCapacity);

      const top = filtered.slice(0, args.limit ?? 10);
      const lines = top.map(
        (p, i) =>
          `${i + 1}. ${p.parkName} (ID: ${p.parkID})\n` +
          `Ilce: ${p.district} | Bos/Kapasite: ${p.emptyCapacity}/${p.capacity}\n` +
          `Tur: ${p.parkType} | Ucretsiz sure: ${p.freeTime} dk | Saat: ${p.workHours}`
      );

      return toolOutput(`ISPARK canli liste sonucu\nToplam kayit: ${rows.length}\nFiltreye uyan: ${filtered.length}\nGosterilen: ${top.length}\n\n${lines.join('\n\n')}`);
    }
  );

  server.registerTool(
    'ispark_otopark_detay',
    {
      title: 'ISPARK otopark detay',
      description: 'Park ID ile ISPARK canli detay bilgisi getirir (adres, tarife, guncelleme zamani).',
      inputSchema: {
        parkId: z.number().int().positive(),
      },
    },
    async (args: { parkId: number }) => {
      const detail = await getIsparkParkDetail(args.parkId);
      const row = detail[0];
      if (!row) {
        return toolOutput(`Park ID ${args.parkId} icin detay bulunamadi.`);
      }

      return toolOutput(JSON.stringify(row, null, 2));
    }
  );

  server.registerTool(
    'kent_lokantalari_listesi',
    {
      title: 'Kent lokantalari listesi',
      description: 'Kent Lokantalari Konumlari veri setinden tesis adlarini, adresleri ve koordinatlarini dondurur.',
      inputSchema: {
        limit: z.number().int().min(1).max(50).default(20).optional(),
        ilceFiltre: z.string().optional(),
      },
    },
    async (args: { limit: number | undefined; ilceFiltre: string | undefined }) => {
      const dataset = await getDatasetByName('kent-lokantalari-konumlari');
      if (!dataset) return toolOutput('Kent Lokantalari veri seti bulunamadi.');

      const resource = dataset.resources[0];
      if (!resource?.url) return toolOutput('Kent Lokantalari veri kaynagi URL bilgisi bulunamadi.');

      const rawRows = await fetchXlsxRows(resource.url);
      const mapped = rawRows.map((r) => {
        const ad = String(r['Tesis Adı'] ?? '').trim();
        const adres = String(r['Adres'] ?? '').trim();
        const lat = normalizeCoord(r['Latitude']);
        const lon = normalizeCoord(r['Latitude_1']);
        return { ad, adres, lat, lon };
      });

      const filtered = args.ilceFiltre
        ? mapped.filter((x) => x.adres.toLocaleLowerCase('tr-TR').includes(args.ilceFiltre!.toLocaleLowerCase('tr-TR')))
        : mapped;

      const limit = args.limit ?? 20;
      const top = filtered.slice(0, limit);

      const lines = top.map((x, i) => `${i + 1}. ${x.ad}\nAdres: ${x.adres}\nKoordinat: ${x.lat ?? '-'}, ${x.lon ?? '-'}`);

      return toolOutput(`Dataset: ${dataset.title} [${dataset.name}]\nToplam tesis: ${mapped.length}\n${args.ilceFiltre ? `Filtre: ${args.ilceFiltre}\n` : ''}Gosterilen: ${top.length}\n\n${lines.join('\n\n')}`);
    }
  );

  server.registerTool(
    'traffic_density',
    {
      title: 'Trafik yogunlugu onizleme',
      description: 'Trafik yogunlugu ile ilgili veri setini arar ve ilk kaynaktan hizli onizleme dondurur.',
      inputSchema: {
        query: z.string().default('trafik yogunluk').optional(),
        limit: z.number().int().min(1).max(20).default(5).optional(),
      },
    },
    async (args: { query: string | undefined; limit: number | undefined }) => {
      const searchQuery = args.query ?? 'trafik yogunluk';
      const limit = args.limit ?? 5;
      const found = await searchDatasets(searchQuery, 1);

      if (!found.results.length) return toolOutput(`'${searchQuery}' icin veri seti bulunamadi.`);

      const dataset = found.results[0]!;
      const resource = pickNewestResource(dataset.resources);

      if (!resource?.id) return toolOutput(`Veri seti bulundu ancak kaynak id yok: ${dataset.title} [${dataset.name}]`);

      try {
        const preview = await fetchResourcePreview(resource.id, limit);
        return toolOutput(
          JSON.stringify(
            {
              dataset: { title: dataset.title, name: dataset.name },
              resource: {
                id: resource.id,
                name: resource.name,
                format: resource.format,
                url: resource.url,
                yearMonthHint: extractYearMonth(resource),
                lastModified: resource.lastModified,
                created: resource.created,
              },
              fields: preview.fields?.map((f) => f.id) ?? [],
              records: preview.records ?? [],
            },
            null,
            2
          )
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'onizleme alinamadi';
        return toolOutput(`Veri seti bulundu fakat datastore onizleme alinamadi.\nDataset: ${dataset.title} [${dataset.name}]\nResource: ${resource.name} (${resource.id})\nURL: ${resource.url ?? 'yok'}\nHata: ${message}`);
      }
    }
  );

  server.registerTool(
    'plan_city_trip',
    {
      title: 'Sehir ici yolculuk plani',
      description: 'Baslangic ve varis noktasina gore ulasim yonlendirme linki ve ilgili IBB ulasim veri setlerini verir.',
      inputSchema: {
        origin: z.string().min(2),
        destination: z.string().min(2),
        mode: z.enum(['transit', 'driving', 'walking', 'bicycling']).default('transit').optional(),
      },
    },
    async (args: { origin: string; destination: string; mode: 'transit' | 'driving' | 'walking' | 'bicycling' | undefined }) => {
      const mode = args.mode ?? 'transit';
      const mapsUrl = buildGoogleDirectionsUrl({ origin: args.origin, destination: args.destination, mode });

      const [mobilityDatasets, trafficDatasets, metroDatasets] = await Promise.all([
        searchDatasets('ulasim web servis', 3),
        searchDatasets('trafik', 3),
        searchDatasets('metro istasyon hat', 3),
      ]);

      const combined = [...mobilityDatasets.results, ...trafficDatasets.results, ...metroDatasets.results];

      const seen = new Set<string>();
      const unique = combined.filter((d) => {
        if (seen.has(d.name)) return false;
        seen.add(d.name);
        return true;
      });

      const datasetLines = unique.slice(0, 6).map(makeDatasetLine).join('\n');
      let livePlanText = 'Canli hat bazli yol tarifi kapali. GOOGLE_MAPS_API_KEY eklenirse adimlar doner.';

      if (mode === 'transit' && config.googleMapsApiKey) {
        try {
          const plan = await getGoogleTransitPlan({ origin: args.origin, destination: args.destination, apiKey: config.googleMapsApiKey });
          const header = [`Rota ozeti: ${plan.summary ?? 'yok'}`, `Tahmini sure: ${plan.durationText ?? 'yok'}`, `Tahmini mesafe: ${plan.distanceText ?? 'yok'}`].join('\n');
          livePlanText = `${header}\n\nAdimlar:\n${formatTransitSteps(plan.steps)}`;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
          livePlanText = `Canli transit adimi alinamadi: ${message}`;
        }
      }

      return toolOutput(`Yolculuk onerisi (${mode}):\n${args.origin} -> ${args.destination}\n\nRota linki:\n${mapsUrl}\n\nCanli yol tarifi:\n${livePlanText}\n\nIlgili IBB ulasim veri setleri:\n${datasetLines}`);
    }
  );

  server.registerTool(
    'baraj_doluluk_oranlari',
    {
      title: 'Baraj Doluluk Oranlari',
      description: 'Istanbul barajlarinin en guncel gunluk doluluk oranlarini getirir. Ornek: Omerli, Terkos vb.',
      inputSchema: {},
    },
    async () => {
      try {
        const latest = await getLatestDamOccupancy();
        const lines = Object.entries(latest)
          .filter(([key, val]) => key !== 'Tarih' && key !== '__EMPTY')
          .map(([key, val]) => {
            const perc = typeof val === 'number' ? (val * 100).toFixed(2) : String(val);
            return `- ${key}: %${perc}`;
          });

        let dateStr = String(latest.Tarih);
        if (typeof latest.Tarih === 'number') {
           // Excel date conversion (approximate for display)
           const date = new Date((latest.Tarih - (25567 + 2)) * 86400 * 1000);
           dateStr = date.toLocaleDateString('tr-TR');
        }

        return toolOutput(`Istanbul Barajlari Guncel Doluluk Oranlari\nTarih: ${dateStr}\n\n${lines.join('\n')}`);
      } catch (e) {
         return toolOutput(`Baraj verisi alinamadi: ${(e as Error).message}`);
      }
    }
  );

  server.registerTool(
    'hava_kalitesi_olcum',
    {
      title: 'Hava Kalitesi Olcumleri',
      description: 'Istasyon ismine gore Istanbul saatlik hava kalitesi olcum verilerini getirir (Ornek: Kadikoy, Besiktas).',
      inputSchema: {
        istasyon: z.string().describe('Hava kalitesi sorgulanacak istasyon adi (ornegin: Kadikoy)'),
      },
    },
    async (args: { istasyon: string }) => {
      try {
        const data = await getAirQualityForStation(args.istasyon);
        if (data.length === 0) {
          return toolOutput(`'${args.istasyon}' adina sahip istasyon bulunamadi veya veri yok.`);
        }

        // Just return the latest 5 records for the station
        const top = data.slice(-5).reverse();
        const lines = top.map((d, i) => {
          return `${i + 1}. Istasyon: ${d.Istasyon || d.Station || 'Bilinmiyor'}\n   Tarih: ${d.Tarih}\n   Bilesenler: ${Object.entries(d)
             .filter(([k]) => k !== 'Istasyon' && k !== 'Station' && k !== 'Tarih' && k !== '__EMPTY')
             .map(([k, v]) => `${k}=${v}`)
             .join(', ')}`;
        });

        return toolOutput(`'${args.istasyon}' icin hava kalitesi verileri (Son kayitlar):\n\n${lines.join('\n\n')}`);
      } catch (e) {
         return toolOutput(`Hava kalitesi verisi alinamadi: ${(e as Error).message}`);
      }
    }
  );
}

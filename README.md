# MCP City Agent (İBB Açık Veri)

İstanbul Büyükşehir Belediyesi (İBB) Açık Veri portalındaki kaynakları hem Model Context Protocol (MCP) üzerinden hem de web uygulaması olarak sunan metadata-odaklı Node.js/TypeScript ajanı.

Bu proje, İBB CKAN portalındaki yüzlerce veri setini LLM'lerin ve son kullanıcıların güvenilir biçimde keşfetmesi, incelemesi ve sorgulaması için generic araçlar üretir. Mimari, tek tek veri seti odaklı entegrasyonlardan çok veri kataloğu + resource yetenek analizi yaklaşımını izler.

## Modlar
- `MCP modu`: Claude Desktop gibi istemciler için stdio üzerinden araç sunar.
- `Web modu`: tarayıcıdan kullanılan tek sayfalık arayüz ve JSON API sunar.
- `LLM entegrasyonu`: OpenAI uyumlu `chat/completions` endpoint'lerine bağlanabilir.

## Kurulum

```bash
cp .env.example .env   # tokenleri yerleştir
npm install            # zaten kuruluysa atla
```

## Çalıştırma

### 1. MCP sunucusu

```bash
npm run dev
```

Bu komut `StdioServerTransport` kullanan MCP sunucusunu ayağa kaldırır.

### 2. Web uygulaması

```bash
npm run dev:web
```

Ardından tarayıcıdan [http://localhost:4000](http://localhost:4000) adresine gidin.

Production için:

```bash
npm run build
npm run start:web
```

## LLM bağlama

Artik 3 farkli yol var:

- `LLM_PROVIDER=openai-compatible` veya `openai`: OpenAI uyumlu endpoint
- `LLM_PROVIDER=deepseek`: DeepSeek resmi API
- `LLM_PROVIDER=gemini`: Gemini resmi API
- `LLM_PROVIDER=auto`: hangi anahtar varsa otomatik secilir. Oncelik sirasini kodda `Gemini -> DeepSeek -> OpenAI-compatible` olarak kurdum.

### OpenAI uyumlu

`.env`:

```env
LLM_PROVIDER=openai-compatible
LLM_API_KEY=your_llm_api_key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
```

Bu yapı OpenAI, OpenRouter veya kendi uyumlu gateway'inizle çalışır.

### DeepSeek

`.env`:

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

Not: DeepSeek resmi dokümanında OpenAI uyumlu format kullanıldığını ve `https://api.deepseek.com` taban URL'sini öneriyor. Ayrıca `deepseek-chat` ve `deepseek-reasoner` modellerinin 24 Temmuz 2026 tarihinde deprecated olacağı belirtiliyor; bu yüzden varsayılanı `deepseek-v4-flash` yaptım.

### Gemini

`.env`:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1
GEMINI_MODEL=gemini-2.5-flash
```

Not: Gemini entegrasyonu resmi `generateContent` REST akisini kullanir.

## Web API

- `GET /api/health` — servis ve LLM durumunu döndürür
- `GET /api/config` — aktif konfigürasyonun güvenli özetini döndürür
- `GET /api/datasets/recent` — son güncellenen veri setlerini listeler
- `GET /api/datasets/search?q=...` — CKAN metadata araması yapar
- `GET /api/datasets/metadata?name=...` — tek veri seti detayını döndürür
- `POST /api/analyze` — soru analizi + ilgili veri setleri + opsiyonel LLM özeti üretir

## Sağlanan araçlar
- `catalog_coverage_report`: canlı CKAN kataloğunu tarar ve erişim kapsamını özetler.
- `analyze_open_data_question`: doğal dil sorusunu uygun dataset/resource seçim akışına bağlar ve güven notlu analiz özeti üretir.
- `suggest_related_datasets`: bir soruya birlikte kullanılabilecek veri seti paketleri ve tema bazlı öneriler üretir.
- `assess_dataset_fitness`: belirli bir veri setinin belirli bir soru için ne kadar uygun olduğunu skorlar ve gerekçelendirir.
- `list_recent_datasets`: veri setlerini `metadata_modified desc` sırasıyla sayfalar.
- `search_datasets`: CKAN `package_search` ile veri setlerini metadata özetleriyle arar.
- `get_dataset_metadata`: `package_show` ile tam veri seti metadata'sını döndürür.
- `inspect_resource_capabilities`: bir resource'un datastore, dosya indirme veya API erişim kabiliyetini çıkarır.
- `profile_resource`: resource alanlarını örnek kayıtlar üzerinden profiller, veri tipi ve kalite ipuçları üretir.
- `detect_geospatial_fields`: resource içinde koordinat, ilçe, mahalle, adres ve geometri sinyallerini tespit eder.
- `preview_file_resource`: `csv`, `xls`, `xlsx`, `json`, `geojson`, `xml`, `kml` gibi indirilebilir kaynaklar için parser tabanlı preview üretir.
- `fetch_resource_preview`: datastore destekleyen resource için ilk kayıtları getirir.
- `query_datastore_resource`: datastore resource'larını sayfalı biçimde sorgular.
- `ispark_otopark_ara`: canlı İSPARK park listesini filtreler.
- `ispark_otopark_detay`: bir parkın detay bilgisini döndürür.
- `kent_lokantalari_listesi`: XLSX kaynaktan kent lokantalarını listeler.
- `traffic_density`: trafik yoğunluğu veri seti için hızlı preview üretir.
- `plan_city_trip`: Google Directions + ilgili İBB veri setleriyle yolculuk önerisi üretir.

## Mimari yaklaşım
- `Catalog layer`: CKAN `package_search`, `package_show`, `resource_show`
- `Capability layer`: resource'un datastore, dosya veya API olarak nasıl erişileceğini tespit etme
- `Access layer`: datastore preview/sorgu ve dosya tabanlı okuma
- `Parsing layer`: indirilebilir resource formatlari icin generic preview parser'lari
- `Analysis orchestration layer`: kullanici sorusunu dataset arama, secim, profiling ve ozetleme adimlarina baglama
- `Related dataset layer`: tek veri seti yerine tema bazli birlikte kullanilabilecek dataset paketleri onermesi
- `Fitness layer`: secilen veri setinin soru baglaminda ne kadar uygun oldugunu skorlama
- `Geospatial layer`: bir resource’un mekansal analiz icin uygunlugunu tespit etme
- `Domain tools`: İSPARK, kent lokantaları, trafik ve yolculuk planı gibi örnek şehir servisleri

Bu yaklaşım, 500+ veri seti olan bir portalda her veri seti için ayrı tool yazmak yerine generic MCP araçlarıyla ölçeklenmeyi hedefler.

## Yapı
- `src/config.ts` — ortam değişkenleri ve sunucu bilgisi
- `src/app/analysisService.ts` — web ve ileride başka giriş noktaları için yeniden kullanılabilir analiz servisleri
- `src/services/httpClient.ts` — CKAN için axios istemcisi ve hata normalizasyonu
- `src/services/llmClient.ts` — OpenAI uyumlu LLM istemcisi
- `src/adapters/ckan.ts` — katalog, dataset metadata ve resource capability adapter'ları
- `src/adapters/ispark.ts` — İSPARK canlı otopark servisleri
- `src/adapters/transitPlanner.ts` — Google Directions tabanlı transit planlayıcı
- `src/mcp/tools.ts` — generic catalog araçları ve şehir odaklı domain tool'ları
- `src/index.ts` — MCP sunucusunu ayağa kaldırır (stdio transport)
- `src/web.ts` — HTTP API ve statik web uygulamasını ayağa kaldırır
- `public/` — tek sayfalık web arayüzü

## Sonraki adımlar
- resource formatına göre otomatik parser zinciri eklemek (`csv`, `geojson`, `json`, `xml`)
- veri seti envanterini embedding veya anahtar kelime indeksine bağlayarak daha güçlü discovery yapmak
- Redis/TTL cache, rate limit ve gözlemlenebilirlik eklemek
- kullanıcı oturumu, sohbet geçmişi ve rapor/export akışı eklemek

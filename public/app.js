const healthText = document.getElementById('healthText');
const llmText = document.getElementById('llmText');
const railLlmText = document.getElementById('railLlmText');
const recentDatasets = document.getElementById('recentDatasets');
const searchResults = document.getElementById('searchResults');
const analysisResults = document.getElementById('analysisResults');
const analysisForm = document.getElementById('analysisForm');
const searchForm = document.getElementById('searchForm');
const analyzeButton = document.getElementById('analyzeButton');
const newQueryButton = document.getElementById('newQueryButton');
const refreshRecentButton = document.getElementById('refreshRecentButton');
const questionInput = document.getElementById('questionInput');

const demoPrompts = {
  kent:
    "Kadıköy’de yeni bir kent lokantası lokasyonu seçmek için İBB açık verilerini ve canlı şehir servislerini birlikte kullan. Kent lokantaları konumlarını listele, yakın çevrede otopark/ulaşım/trafik gibi destekleyici veri setlerini bul, uygun veri kaynaklarını değerlendir ve karar için hangi ek analizlerin yapılması gerektiğini açıkla.",
  trafik:
    "İstanbul’da trafik yoğunluğunu azaltmak için hangi İBB açık veri setleri birlikte analiz edilmeli? Trafik yoğunluğu, duyurular, ulaşım ve mekansal alan uygunluğunu birlikte değerlendir.",
  otopark:
    "Beşiktaş’ta otopark ihtiyacını değerlendirmek için İSPARK ve İBB açık veri kaynaklarını kullan. Kapasite, erişilebilirlik, trafik ve destekleyici veri setlerini sırala.",
};

function truncateText(value, limit = 220) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}...` : text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatLlmAnswer(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n{3,}/g, '\n\n');
}

function setButtonLoading(isLoading) {
  analyzeButton.disabled = isLoading;
  analyzeButton.classList.toggle('loading', isLoading);
  analyzeButton.innerHTML = isLoading
    ? '<span class="material-symbols-outlined">progress_activity</span> İşleniyor'
    : '<span class="material-symbols-outlined">bolt</span> Analiz Et';
}

function renderSkeleton() {
  analysisResults.classList.remove('empty-state');
  analysisResults.innerHTML = `
    <div class="loading-skeleton" aria-live="polite">
      <div class="skeleton-card"></div>
      <div class="skeleton-line" style="width: 86%"></div>
      <div class="skeleton-line" style="width: 64%"></div>
      <div class="summary-grid">
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>
    </div>
  `;
}

function renderEmptyAnalysis() {
  analysisResults.classList.add('empty-state');
  analysisResults.innerHTML = `
    <div class="empty-core">
      <div class="empty-icon">
        <span class="material-symbols-outlined">insights</span>
      </div>
      <h3>Analiz sonucu burada görünecek.</h3>
      <p>Hazır.</p>
    </div>
  `;
}

function datasetCard(dataset) {
  const tags = (dataset.tags || [])
    .slice(0, 3)
    .map((tag) => `<span class="meta-pill">${escapeHtml(tag)}</span>`)
    .join('');
  const resources = (dataset.resources || [])
    .slice(0, 2)
    .map((resource) => `<span class="meta-pill">${escapeHtml(resource.format || 'n/a')}</span>`)
    .join('');

  return `
    <article class="result-card">
      <h3>${escapeHtml(dataset.title)}</h3>
      <p class="dataset-name">${escapeHtml(dataset.name)}</p>
      <p>${escapeHtml(truncateText(dataset.notes || 'Açıklama yok.', 135))}</p>
      <div class="meta-row">
        ${dataset.organization ? `<span class="meta-pill">${escapeHtml(dataset.organization)}</span>` : ''}
        ${dataset.metadataModified ? `<span class="meta-pill">${escapeHtml(dataset.metadataModified.slice(0, 10))}</span>` : ''}
        <span class="meta-pill">${escapeHtml(dataset.resourceCount)} kaynak</span>
      </div>
      <div class="meta-row">${tags}${resources}</div>
    </article>
  `;
}

function renderRecentDatasets(payload) {
  if (!payload.datasets?.length) {
    recentDatasets.innerHTML = 'Güncel dataset bulunamadı.';
    return;
  }

  recentDatasets.classList.remove('empty-state');
  recentDatasets.innerHTML = payload.datasets.map(datasetCard).join('');
}

function renderSearchResults(payload) {
  if (!payload.datasets?.length) {
    searchResults.innerHTML = 'Eşleşen dataset bulunamadı.';
    return;
  }

  searchResults.classList.remove('empty-state');
  searchResults.innerHTML = payload.datasets.map(datasetCard).join('');
}

function renderAnalysis(payload) {
  const parts = [];
  analysisResults.classList.remove('empty-state');

  if (payload.llm?.answer) {
    parts.push(`
      <section class="analysis-block">
        <h3>LLM Özeti</h3>
        <div class="answer-text">${formatLlmAnswer(payload.llm.answer)}</div>
      </section>
    `);
  } else if (payload.llm?.error) {
    parts.push(`
      <section class="analysis-block">
        <h3>LLM Durumu</h3>
        <p>${escapeHtml(truncateText(payload.llm.error, 220))}</p>
      </section>
    `);
  }

  if (payload.analysis?.selectedDataset) {
    const dataset = payload.analysis.selectedDataset;
    const resource = payload.analysis.selectedResource;
    const summary = payload.analysis.analysisSummary || {};
    const alternatives = (payload.analysis.alternatives || []).filter((item) => Number(item.dataset?.score ?? 0) >= 8);

    parts.push(`
      <section class="analysis-block selected-dataset">
        <h3>Seçilen Dataset</h3>
        <p><strong>${escapeHtml(dataset.title)}</strong></p>
        <p class="dataset-name">${escapeHtml(dataset.name)}</p>
        <div class="meta-row">
          <span class="meta-pill">Güven: ${escapeHtml(payload.analysis.confidence || 'bilinmiyor')}</span>
          <span class="meta-pill">Skor: ${escapeHtml(dataset.score)}</span>
          ${resource?.capabilities?.recommendedAccessMethod ? `<span class="meta-pill">${escapeHtml(resource.capabilities.recommendedAccessMethod)}</span>` : ''}
        </div>
        <p>${escapeHtml(truncateText(dataset.notes || 'Açıklama yok.', 240))}</p>
        <div class="meta-row">
          ${dataset.organization ? `<span class="meta-pill">${escapeHtml(dataset.organization)}</span>` : ''}
          ${dataset.metadataModified ? `<span class="meta-pill">${escapeHtml(dataset.metadataModified.slice(0, 10))}</span>` : ''}
        </div>
        ${resource ? `<p><strong>Önerilen kaynak:</strong> ${escapeHtml(resource.name)} (${escapeHtml(resource.format || 'n/a')})</p>` : ''}
      </section>
    `);

    const why = (summary.whyThisDataset || []).slice(0, 3);
    const profile = (summary.profileInsights || []).slice(0, 3);
    const hints = (summary.decisionHints || []).slice(0, 3);

    if (why.length || profile.length || hints.length) {
      parts.push(`
        <section class="summary-grid">
          ${why.length ? `
            <article class="summary-card">
              <h3>Neden Seçildi</h3>
              <ul class="clean">${why.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </article>
          ` : ''}
          ${profile.length ? `
            <article class="summary-card">
              <h3>Profil</h3>
              <ul class="clean">${profile.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </article>
          ` : ''}
          ${hints.length ? `
            <article class="summary-card">
              <h3>Karar İpuçları</h3>
              <ul class="clean">${hints.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </article>
          ` : ''}
        </section>
      `);
    }

    if (summary.limitations?.length) {
      parts.push(`
        <section class="analysis-block">
          <h3>Sınırlar</h3>
          <ul class="clean">${summary.limitations.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </section>
      `);
    }

    if (alternatives.length) {
      parts.push(`
        <section class="analysis-block">
          <h3>Alternatifler</h3>
          <ul class="clean">${alternatives.slice(0, 4).map((item) => `<li>${escapeHtml(item.dataset.title)} - skor ${escapeHtml(item.dataset.score)}</li>`).join('')}</ul>
        </section>
      `);
    }
  } else if (payload.analysis?.message) {
    parts.push(`
      <section class="analysis-block">
        <h3>Analiz</h3>
        <p>${escapeHtml(payload.analysis.message)}</p>
      </section>
    `);
  }

  const recommendedBundle = (payload.relatedDatasets?.recommendedBundle || []).filter(
    (item) => Number(item.dataset?.score ?? 0) >= 8
  );

  if (recommendedBundle.length) {
    parts.push(`
      <section class="analysis-block">
        <h3>İlgili Dataset Paketi</h3>
        <ul class="clean">
          ${recommendedBundle
            .slice(0, 8)
            .map((item) => `<li>${escapeHtml(item.dataset.title)} - skor ${escapeHtml(item.dataset.score)}</li>`)
            .join('')}
        </ul>
      </section>
    `);
  }

  analysisResults.innerHTML = parts.join('') || 'Sonuç bulunamadı.';
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'İstek başarısız.');
  }
  return payload;
}

async function loadConfig() {
  try {
    const [health, config] = await Promise.all([
      fetchJson('/api/health'),
      fetchJson('/api/config'),
    ]);

    healthText.textContent = health.ok ? 'Online' : 'Hatalı';
    const llmLabel = config.llmConfigured ? `${config.llmProvider} / ${config.llmModel}` : 'Kapalı';
    llmText.textContent = llmLabel;
    railLlmText.textContent = `LLM: ${llmLabel}`;
  } catch (error) {
    healthText.textContent = 'Erişim hatası';
    llmText.textContent = error.message;
    railLlmText.textContent = 'LLM: bilinmiyor';
  }
}

async function loadRecentDatasets() {
  try {
    recentDatasets.textContent = 'Yükleniyor...';
    const payload = await fetchJson('/api/datasets/recent?rows=4');
    renderRecentDatasets(payload);
  } catch (error) {
    recentDatasets.textContent = error.message;
  }
}

analysisForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setButtonLoading(true);
  renderSkeleton();

  const body = {
    question: questionInput.value,
    maxDatasets: 5,
    sampleSize: 10,
    useLlm: document.getElementById('useLlmInput').checked,
  };

  try {
    const payload = await fetchJson('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    renderAnalysis(payload);
  } catch (error) {
    analysisResults.classList.remove('empty-state');
    analysisResults.innerHTML = `<section class="analysis-block"><h3>Hata</h3><p>${escapeHtml(error.message)}</p></section>`;
  } finally {
    setButtonLoading(false);
  }
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = document.getElementById('searchInput').value.trim();
  if (query.length < 2) {
    searchResults.textContent = 'En az 2 karakterlik arama girin.';
    return;
  }

  searchResults.textContent = 'Aranıyor...';
  try {
    const payload = await fetchJson(`/api/datasets/search?q=${encodeURIComponent(query)}&rows=6`);
    renderSearchResults(payload);
  } catch (error) {
    searchResults.textContent = error.message;
  }
});

document.querySelectorAll('[data-prompt]').forEach((button) => {
  button.addEventListener('click', () => {
    const prompt = demoPrompts[button.dataset.prompt];
    if (!prompt) return;
    questionInput.value = prompt;
    questionInput.focus();
  });
});

newQueryButton.addEventListener('click', () => {
  questionInput.value = '';
  renderEmptyAnalysis();
  questionInput.focus();
});

refreshRecentButton.addEventListener('click', loadRecentDatasets);

loadConfig();
loadRecentDatasets();

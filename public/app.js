const healthText = document.getElementById('healthText');
const llmText = document.getElementById('llmText');
const recentDatasets = document.getElementById('recentDatasets');
const searchResults = document.getElementById('searchResults');
const analysisResults = document.getElementById('analysisResults');
const analysisForm = document.getElementById('analysisForm');
const searchForm = document.getElementById('searchForm');
const analyzeButton = document.getElementById('analyzeButton');

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

function datasetCard(dataset) {
  const tags = (dataset.tags || []).slice(0, 5).map((tag) => `<span class="meta-pill">${escapeHtml(tag)}</span>`).join('');
  const resources = (dataset.resources || [])
    .slice(0, 3)
    .map((resource) => `<span class="meta-pill">${escapeHtml(resource.format || 'n/a')} · ${escapeHtml(resource.name)}</span>`)
    .join('');

  return `
    <article class="result-card">
      <h3>${escapeHtml(dataset.title)}</h3>
      <p><strong>${escapeHtml(dataset.name)}</strong></p>
      <p>${escapeHtml(truncateText(dataset.notes || 'Aciklama yok.', 180))}</p>
      <div class="meta-row">
        ${dataset.organization ? `<span class="meta-pill">${escapeHtml(dataset.organization)}</span>` : ''}
        ${dataset.metadataModified ? `<span class="meta-pill">${escapeHtml(dataset.metadataModified)}</span>` : ''}
        <span class="meta-pill">${escapeHtml(dataset.resourceCount)} kaynak</span>
      </div>
      <div class="meta-row">${tags}${resources}</div>
    </article>
  `;
}

function renderRecentDatasets(payload) {
  if (!payload.datasets?.length) {
    recentDatasets.innerHTML = 'Guncel dataset bulunamadi.';
    return;
  }

  recentDatasets.innerHTML = payload.datasets.map(datasetCard).join('');
}

function renderSearchResults(payload) {
  if (!payload.datasets?.length) {
    searchResults.innerHTML = 'Eslesen dataset bulunamadi.';
    return;
  }

  searchResults.innerHTML = payload.datasets.map(datasetCard).join('');
}

function renderAnalysis(payload) {
  const parts = [];

  if (payload.llm?.answer) {
    parts.push(`
      <section class="analysis-block">
        <h3>LLM Ozeti</h3>
        <p>${escapeHtml(truncateText(payload.llm.answer, 420))}</p>
      </section>
    `);
  } else if (payload.llm?.error) {
    parts.push(`
      <section class="analysis-block">
        <h3>LLM Durumu</h3>
        <p class="muted-note">${escapeHtml(truncateText(payload.llm.error, 180))}</p>
      </section>
    `);
  }

  if (payload.analysis?.selectedDataset) {
    const dataset = payload.analysis.selectedDataset;
    const resource = payload.analysis.selectedResource;
    const summary = payload.analysis.analysisSummary || {};
    const alternatives = payload.analysis.alternatives || [];

    parts.push(`
      <section class="analysis-block">
        <h3>Secilen Dataset</h3>
        <p><strong>${escapeHtml(dataset.title)}</strong> (${escapeHtml(dataset.name)})</p>
        <p>Guven: ${escapeHtml(payload.analysis.confidence || 'bilinmiyor')} · Skor: ${escapeHtml(dataset.score)}</p>
        <p>${escapeHtml(truncateText(dataset.notes || 'Aciklama yok.', 260))}</p>
        <div class="meta-row">
          ${dataset.organization ? `<span class="meta-pill">${escapeHtml(dataset.organization)}</span>` : ''}
          ${dataset.metadataModified ? `<span class="meta-pill">${escapeHtml(dataset.metadataModified)}</span>` : ''}
        </div>
        ${resource ? `<p><strong>Onerilen kaynak:</strong> ${escapeHtml(resource.name)} (${escapeHtml(resource.format || 'n/a')})</p>` : ''}
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
              <h3>Neden Secildi</h3>
              <ul class="clean">${why.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </article>
          ` : ''}
          ${profile.length ? `
            <article class="summary-card">
              <h3>Profil Ozetleri</h3>
              <ul class="clean">${profile.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </article>
          ` : ''}
          ${hints.length ? `
            <article class="summary-card">
              <h3>Karar Ipuclari</h3>
              <ul class="clean">${hints.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </article>
          ` : ''}
        </section>
      `);
    }

    if (summary.limitations?.length) {
      parts.push(`
        <section class="analysis-block">
          <h3>Sinirlar</h3>
          <ul class="clean">${summary.limitations.slice(0, 2).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </section>
      `);
    }

    if (alternatives.length) {
      parts.push(`
        <section class="analysis-block">
          <h3>Alternatifler</h3>
          <ul class="clean">${alternatives.slice(0, 3).map((item) => `<li>${escapeHtml(item.dataset.title)} (${escapeHtml(item.dataset.name)}) · skor ${escapeHtml(item.dataset.score)}</li>`).join('')}</ul>
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

  if (payload.relatedDatasets?.recommendedBundle?.length) {
    parts.push(`
      <section class="analysis-block">
        <h3>Ilgili Dataset Paketleri</h3>
        <ul class="clean">
          ${payload.relatedDatasets.recommendedBundle
            .map((item) => `<li>${escapeHtml(item.dataset.title)} (${escapeHtml(item.dataset.name)}) · skor ${escapeHtml(item.dataset.score)}</li>`)
            .join('')}
        </ul>
      </section>
    `);
  }

  analysisResults.innerHTML = parts.join('') || 'Sonuc bulunamadi.';
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Istek basarisiz.');
  }
  return payload;
}

async function loadConfig() {
  try {
    const [health, config] = await Promise.all([
      fetchJson('/api/health'),
      fetchJson('/api/config'),
    ]);

    healthText.textContent = health.ok ? 'Servis ayakta' : 'Servis hatali';
    llmText.textContent = config.llmConfigured
      ? `LLM hazir: ${config.llmProvider} / ${config.llmModel}`
      : 'LLM bagli degil. Yalnizca veri analizi kullanilabilir.';
  } catch (error) {
    healthText.textContent = 'Erisesim hatasi';
    llmText.textContent = error.message;
  }
}

async function loadRecentDatasets() {
  try {
    const payload = await fetchJson('/api/datasets/recent?rows=4');
    renderRecentDatasets(payload);
  } catch (error) {
    recentDatasets.textContent = error.message;
  }
}

analysisForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  analyzeButton.disabled = true;
  analyzeButton.textContent = 'Analiz suruyor...';
  analysisResults.textContent = 'Veri setleri taraniyor...';

  const body = {
    question: document.getElementById('questionInput').value,
    maxDatasets: Number(document.getElementById('maxDatasetsInput').value || '3'),
    sampleSize: Number(document.getElementById('sampleSizeInput').value || '10'),
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
    analysisResults.textContent = error.message;
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = 'Analiz Et';
  }
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = document.getElementById('searchInput').value.trim();
  if (query.length < 2) {
    searchResults.textContent = 'En az 2 karakterlik arama girin.';
    return;
  }

  searchResults.textContent = 'Araniyor...';
  try {
    const payload = await fetchJson(`/api/datasets/search?q=${encodeURIComponent(query)}&rows=8`);
    renderSearchResults(payload);
  } catch (error) {
    searchResults.textContent = error.message;
  }
});

loadConfig();
loadRecentDatasets();

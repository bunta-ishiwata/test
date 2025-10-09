// Simple vanilla JS dashboard (React requires build step, using vanilla for immediate results)

class ArticleDashboard {
  constructor() {
    this.data = null;
    this.init();
  }

  async init() {
    await this.loadData();
    this.render();
    this.attachEventListeners();
    
    // Auto refresh every 30 seconds
    setInterval(() => this.loadData(), 30000);
  }

  async loadData() {
    try {
      const [summary, performance, articles] = await Promise.all([
        fetch('/api/dashboard/summary').then(r => r.json()),
        fetch('/api/dashboard/performance?range=7days').then(r => r.json()),
        fetch('/api/dashboard/articles').then(r => r.json())
      ]);
      
      this.data = { summary, performance, articles };
      if (document.querySelector('.dashboard')) {
        this.updateData();
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }

  render() {
    const app = document.getElementById('root');
    app.innerHTML = `
      <div class="dashboard">
        <header class="dashboard-header">
          <h1>📊 Article Dashboard</h1>
          <div class="last-updated">最終更新: <span id="lastUpdated">${new Date().toLocaleTimeString('ja-JP')}</span></div>
        </header>

        <section class="metrics-cards">
          <div class="metric-card">
            <div class="metric-header">
              <h3>📝 今日書いた記事</h3>
              <span class="metric-count" id="writtenCount">0</span>
            </div>
            <ul class="metric-list" id="writtenList"></ul>
          </div>

          <div class="metric-card">
            <div class="metric-header">
              <h3>🔄 今日リライトした記事</h3>
              <span class="metric-count" id="rewrittenCount">0</span>
            </div>
            <ul class="metric-list" id="rewrittenList"></ul>
            <div class="sub-metric" id="rankingUpBadge"></div>
          </div>

          <div class="metric-card">
            <div class="metric-header">
              <h3>🎯 今日CVした記事</h3>
              <span class="metric-count" id="convertedCount">0</span>
            </div>
            <ul class="metric-list" id="convertedList"></ul>
          </div>
        </section>

        <section class="chart-section">
          <div class="chart-header">
            <h2>パフォーマンス推移</h2>
            <select id="dateRange" class="date-selector">
              <option value="7days">過去7日</option>
              <option value="28days">過去28日</option>
              <option value="90days">過去90日</option>
            </select>
          </div>
          <div id="performanceChart" class="chart-container">
            <canvas id="chartCanvas"></canvas>
          </div>
        </section>

        <section class="articles-section">
          <h2>記事一覧</h2>
          <div class="table-container">
            <table class="articles-table">
              <thead>
                <tr>
                  <th>KW</th>
                  <th>順位</th>
                  <th>記事タイトル</th>
                  <th>公開日</th>
                  <th>更新日</th>
                  <th>クリック</th>
                  <th>表示</th>
                  <th>CTR</th>
                  <th>週推移</th>
                  <th>月推移</th>
                  <th>週CV</th>
                  <th>月CV</th>
                  <th>累計CV</th>
                </tr>
              </thead>
              <tbody id="articlesTableBody"></tbody>
            </table>
          </div>
        </section>
      </div>
    `;

    this.updateData();
  }

  updateData() {
    if (!this.data) return;

    // Update summary metrics
    const { summary, articles } = this.data;
    
    document.getElementById('writtenCount').textContent = summary.todayWritten.length;
    document.getElementById('rewrittenCount').textContent = summary.todayRewritten.length;
    document.getElementById('convertedCount').textContent = summary.todayConverted.length;

    // Update lists
    this.updateList('writtenList', summary.todayWritten);
    this.updateList('rewrittenList', summary.todayRewritten);
    this.updateList('convertedList', summary.todayConverted);

    // Update ranking badge
    if (summary.todayRankingUp.length > 0) {
      document.getElementById('rankingUpBadge').innerHTML = 
        `<span class="badge success">📈 順位UP: ${summary.todayRankingUp.length}件</span>`;
    }

    // Update articles table
    this.updateArticlesTable(articles);
    
    // Update chart
    this.updateChart();

    // Update last updated time
    document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString('ja-JP');
  }

  updateList(elementId, items) {
    const list = document.getElementById(elementId);
    list.innerHTML = items.slice(0, 3).map(item => 
      `<li><a href="${item.url}" target="_blank">${item.title}</a></li>`
    ).join('');
  }

  updateArticlesTable(articles) {
    const tbody = document.getElementById('articlesTableBody');
    tbody.innerHTML = articles.map(article => `
      <tr>
        <td class="keyword">${article.keyword}</td>
        <td class="ranking ${article.ranking <= 3 ? 'top3' : article.ranking <= 10 ? 'top10' : ''}">${article.ranking || '-'}</td>
        <td class="title"><a href="${article.url}" target="_blank">${article.title}</a></td>
        <td>${new Date(article.publishDate).toLocaleDateString('ja-JP')}</td>
        <td>${article.updateDate ? new Date(article.updateDate).toLocaleDateString('ja-JP') : '-'}</td>
        <td class="number">${article.clicks.toLocaleString()}</td>
        <td class="number">${article.impressions.toLocaleString()}</td>
        <td class="ctr">${(article.ctr * 100).toFixed(2)}%</td>
        <td class="trend ${article.weeklyAvg > 0 ? 'up' : article.weeklyAvg < 0 ? 'down' : ''}">
          ${article.weeklyAvg > 0 ? '↑' : article.weeklyAvg < 0 ? '↓' : '→'}${Math.abs(article.weeklyAvg)}
        </td>
        <td class="trend ${article.monthlyAvg > 0 ? 'up' : article.monthlyAvg < 0 ? 'down' : ''}">
          ${article.monthlyAvg > 0 ? '↑' : article.monthlyAvg < 0 ? '↓' : '→'}${Math.abs(article.monthlyAvg)}
        </td>
        <td class="cv">${article.weeklyCV}</td>
        <td class="cv">${article.monthlyCV}</td>
        <td class="cv total">${article.totalCV}</td>
      </tr>
    `).join('');
  }

  updateChart() {
    const canvas = document.getElementById('chartCanvas');
    const ctx = canvas.getContext('2d');
    const { performance } = this.data;
    
    // Simple line chart drawing (without Chart.js for now)
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = 300;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw axes
    ctx.strokeStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.moveTo(40, 10);
    ctx.lineTo(40, 260);
    ctx.lineTo(canvas.width - 20, 260);
    ctx.stroke();
    
    // Draw data
    if (performance && performance.clicks) {
      const maxClicks = Math.max(...performance.clicks);
      const maxImpressions = Math.max(...performance.impressions);
      const xStep = (canvas.width - 60) / (performance.clicks.length - 1);
      
      // Draw clicks line
      ctx.strokeStyle = '#4bc0c0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      performance.clicks.forEach((value, i) => {
        const x = 40 + i * xStep;
        const y = 260 - (value / maxClicks * 240);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      
      // Draw impressions line
      ctx.strokeStyle = '#ff6384';
      ctx.beginPath();
      performance.impressions.forEach((value, i) => {
        const x = 40 + i * xStep;
        const y = 260 - (value / maxImpressions * 240);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      
      // Draw labels
      ctx.fillStyle = '#666';
      ctx.font = '10px sans-serif';
      performance.dates.forEach((date, i) => {
        if (i % Math.ceil(performance.dates.length / 7) === 0) {
          const x = 40 + i * xStep;
          ctx.fillText(date, x - 15, 275);
        }
      });
      
      // Legend
      ctx.fillStyle = '#4bc0c0';
      ctx.fillRect(canvas.width - 150, 20, 10, 10);
      ctx.fillStyle = '#666';
      ctx.fillText('クリック数', canvas.width - 135, 29);
      
      ctx.fillStyle = '#ff6384';
      ctx.fillRect(canvas.width - 150, 40, 10, 10);
      ctx.fillStyle = '#666';
      ctx.fillText('表示回数', canvas.width - 135, 49);
    }
  }

  attachEventListeners() {
    document.getElementById('dateRange').addEventListener('change', async (e) => {
      const range = e.target.value;
      const performance = await fetch(`/api/dashboard/performance?range=${range}`).then(r => r.json());
      this.data.performance = performance;
      this.updateChart();
    });
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ArticleDashboard();
});
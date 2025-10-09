import React, { useState, useEffect } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { SearchConsoleAPI } from '../integrations/google';
import { ArticleDB } from '../database';

interface DashboardData {
  todayWritten: Article[];
  todayRewritten: Article[];
  todayRankingUp: Article[];
  todayConverted: Article[];
  chartData: ChartData;
  articleList: ArticleRow[];
}

interface Article {
  id: string;
  title: string;
  url: string;
  publishDate: Date;
  updateDate?: Date;
}

interface ArticleRow extends Article {
  keyword: string;
  ranking: number;
  clicks: number;
  impressions: number;
  ctr: number;
  weeklyAvg: number;
  monthlyAvg: number;
  weeklyCV: number;
  monthlyCV: number;
  totalCV: number;
}

const ArticleDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7days');

  useEffect(() => {
    fetchDashboardData();
  }, [dateRange]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [
        todayArticles,
        searchConsoleData,
        conversionData
      ] = await Promise.all([
        ArticleDB.getTodayArticles(),
        SearchConsoleAPI.getPerformanceData(dateRange),
        ArticleDB.getConversionData(dateRange)
      ]);

      const dashboardData: DashboardData = {
        todayWritten: todayArticles.written,
        todayRewritten: todayArticles.rewritten,
        todayRankingUp: todayArticles.rankingUp,
        todayConverted: todayArticles.converted,
        chartData: processChartData(searchConsoleData),
        articleList: await compileArticleList(searchConsoleData, conversionData)
      };

      setData(dashboardData);
    } catch (error) {
      console.error('Dashboard data fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const processChartData = (searchData: any): ChartData => {
    return {
      labels: searchData.dates,
      datasets: [
        {
          label: 'クリック数',
          data: searchData.clicks,
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.1
        },
        {
          label: '表示回数',
          data: searchData.impressions,
          borderColor: 'rgb(255, 99, 132)',
          tension: 0.1
        }
      ]
    };
  };

  const compileArticleList = async (
    searchData: any,
    conversionData: any
  ): Promise<ArticleRow[]> => {
    const articles = await ArticleDB.getAllArticles();
    
    return articles.map(article => {
      const searchMetrics = searchData.byPage[article.url] || {};
      const cvMetrics = conversionData[article.id] || {};
      
      return {
        ...article,
        keyword: article.targetKeyword,
        ranking: searchMetrics.position || 0,
        clicks: searchMetrics.clicks || 0,
        impressions: searchMetrics.impressions || 0,
        ctr: searchMetrics.ctr || 0,
        weeklyAvg: calculateWeeklyAvg(searchMetrics),
        monthlyAvg: calculateMonthlyAvg(searchMetrics),
        weeklyCV: cvMetrics.weekly || 0,
        monthlyCV: cvMetrics.monthly || 0,
        totalCV: cvMetrics.total || 0
      };
    });
  };

  const calculateWeeklyAvg = (metrics: any): number => {
    // 1週間の平均順位変化計算
    return metrics.weeklyPositionChange || 0;
  };

  const calculateMonthlyAvg = (metrics: any): number => {
    // 1ヶ月の平均順位変化計算
    return metrics.monthlyPositionChange || 0;
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!data) return <div className="error">データの取得に失敗しました</div>;

  return (
    <div className="dashboard">
      {/* 上部3列表示 */}
      <div className="top-metrics">
        <div className="metric-card">
          <h3>📝 今日書いた記事</h3>
          <div className="count">{data.todayWritten.length}</div>
          <ul className="article-list-mini">
            {data.todayWritten.slice(0, 3).map(article => (
              <li key={article.id}>
                <a href={article.url}>{article.title}</a>
              </li>
            ))}
          </ul>
        </div>

        <div className="metric-card">
          <h3>🔄 今日リライトした記事</h3>
          <div className="count">{data.todayRewritten.length}</div>
          <ul className="article-list-mini">
            {data.todayRewritten.slice(0, 3).map(article => (
              <li key={article.id}>
                <a href={article.url}>{article.title}</a>
              </li>
            ))}
          </ul>
          {data.todayRankingUp.length > 0 && (
            <div className="sub-metric">
              <span className="badge">📈 順位UP: {data.todayRankingUp.length}件</span>
            </div>
          )}
        </div>

        <div className="metric-card">
          <h3>🎯 今日CVした記事</h3>
          <div className="count">{data.todayConverted.length}</div>
          <ul className="article-list-mini">
            {data.todayConverted.slice(0, 3).map(article => (
              <li key={article.id}>
                <a href={article.url}>{article.title}</a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 推移チャート */}
      <div className="chart-section">
        <div className="chart-header">
          <h2>パフォーマンス推移</h2>
          <select 
            value={dateRange} 
            onChange={(e) => setDateRange(e.target.value)}
            className="date-range-selector"
          >
            <option value="7days">過去7日</option>
            <option value="28days">過去28日</option>
            <option value="90days">過去90日</option>
          </select>
        </div>
        <Line data={data.chartData} />
      </div>

      {/* 記事一覧テーブル */}
      <div className="article-table-section">
        <h2>記事一覧</h2>
        <table className="article-table">
          <thead>
            <tr>
              <th>KW</th>
              <th>順位</th>
              <th>記事タイトル</th>
              <th>URL</th>
              <th>公開日</th>
              <th>更新日</th>
              <th>クリック</th>
              <th>表示</th>
              <th>CTR</th>
              <th>週間推移</th>
              <th>月間推移</th>
              <th>週CV</th>
              <th>月CV</th>
              <th>累計CV</th>
            </tr>
          </thead>
          <tbody>
            {data.articleList.map(article => (
              <tr key={article.id}>
                <td>{article.keyword}</td>
                <td className="ranking">
                  {article.ranking > 0 ? article.ranking : '-'}
                </td>
                <td className="title">
                  <a href={article.url}>{article.title}</a>
                </td>
                <td className="url">{article.url}</td>
                <td>{new Date(article.publishDate).toLocaleDateString()}</td>
                <td>{article.updateDate ? new Date(article.updateDate).toLocaleDateString() : '-'}</td>
                <td>{article.clicks}</td>
                <td>{article.impressions}</td>
                <td>{(article.ctr * 100).toFixed(2)}%</td>
                <td className={article.weeklyAvg > 0 ? 'positive' : article.weeklyAvg < 0 ? 'negative' : ''}>
                  {article.weeklyAvg > 0 ? '↑' : article.weeklyAvg < 0 ? '↓' : '→'}
                  {Math.abs(article.weeklyAvg)}
                </td>
                <td className={article.monthlyAvg > 0 ? 'positive' : article.monthlyAvg < 0 ? 'negative' : ''}>
                  {article.monthlyAvg > 0 ? '↑' : article.monthlyAvg < 0 ? '↓' : '→'}
                  {Math.abs(article.monthlyAvg)}
                </td>
                <td>{article.weeklyCV}</td>
                <td>{article.monthlyCV}</td>
                <td className="total-cv">{article.totalCV}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ArticleDashboard;
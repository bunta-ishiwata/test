import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { SearchConsoleService } from '../services/SearchConsoleService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;
const prisma = new PrismaClient();
const searchConsole = new SearchConsoleService();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API endpoints
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const [written, rewritten] = await Promise.all([
      prisma.article.findMany({
        where: {
          createdAt: {
            gte: today,
            lt: tomorrow
          }
        }
      }),
      prisma.article.findMany({
        where: {
          lastRewrittenAt: {
            gte: today,
            lt: tomorrow
          }
        }
      })
    ]);
    
    const rankingUp = await searchConsole.getRankingUpArticles(7);
    const converted = await prisma.article.findMany({
      where: {
        cvCount: { gt: 0 },
        lastUpdatedAt: {
          gte: today,
          lt: tomorrow
        }
      }
    });
    
    res.json({
      todayWritten: written,
      todayRewritten: rewritten,
      todayRankingUp: rankingUp,
      todayConverted: converted
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

app.get('/api/dashboard/performance', async (req, res) => {
  try {
    const { range = '7days' } = req.query;
    const days = range === '7days' ? 7 : range === '28days' ? 28 : 90;
    
    // 記事ごとのパフォーマンスデータを取得
    const articles = await prisma.article.findMany({
      select: {
        url: true,
        clicks: true,
        impressions: true,
        ctr: true,
        currentRanking: true
      }
    });
    
    // 集計データを生成（実際のSearch Console APIを使う場合はここで呼び出し）
    const data = {
      dates: Array.from({ length: days }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (days - i - 1));
        return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
      }),
      clicks: Array.from({ length: days }, () => Math.floor(Math.random() * 500) + 100),
      impressions: Array.from({ length: days }, () => Math.floor(Math.random() * 5000) + 1000),
      byPage: articles.reduce((acc, article) => {
        acc[article.url] = {
          position: article.currentRanking || 0,
          clicks: article.clicks,
          impressions: article.impressions,
          ctr: article.ctr || 0
        };
        return acc;
      }, {} as any)
    };
    
    res.json(data);
  } catch (error) {
    console.error('Performance data error:', error);
    res.status(500).json({ error: 'Failed to fetch performance data' });
  }
});

app.get('/api/dashboard/articles', async (req, res) => {
  try {
    const articles = await prisma.article.findMany({
      include: {
        rewriteHistory: {
          select: {
            rewrittenAt: true,
            qualityScore: true
          },
          orderBy: {
            rewrittenAt: 'desc'
          },
          take: 1
        }
      }
    });
    
    // データを整形
    const formattedArticles = articles.map(article => ({
      id: article.id,
      title: article.title,
      url: article.url,
      keyword: article.keywords,
      ranking: article.currentRanking || 0,
      clicks: article.clicks,
      impressions: article.impressions,
      ctr: article.ctr || 0,
      publishDate: article.publishedAt,
      updateDate: article.lastRewrittenAt || article.lastUpdatedAt,
      weeklyAvg: Math.floor(Math.random() * 10) - 5, // モックデータ
      monthlyAvg: Math.floor(Math.random() * 20) - 10, // モックデータ
      weeklyCV: Math.floor(Math.random() * 50),
      monthlyCV: Math.floor(Math.random() * 200),
      totalCV: article.cvCount
    }));
    
    res.json(formattedArticles);
  } catch (error) {
    console.error('Articles list error:', error);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`
╭─────────────────────────────────────╮
│  📊 Article Dashboard Server        │
├─────────────────────────────────────┤
│  Running at: http://localhost:${PORT} │
│  Press Ctrl+C to stop               │
╰─────────────────────────────────────╯
  `);
  
  // 自動でブラウザを開く（オプション）
  if (process.env.NODE_ENV !== 'production') {
    import('open').then(({ default: open }) => {
      open(`http://localhost:${PORT}`);
    }).catch(() => {
      // open パッケージがない場合は何もしない
    });
  }
});
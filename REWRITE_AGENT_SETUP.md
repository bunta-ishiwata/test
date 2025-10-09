# リライトエージェント本番実装ガイド

## 🎯 必要な準備

### 1. 必要なAPIキー取得
```env
# .env ファイルに設定
ANTHROPIC_API_KEY=sk-ant-xxxxx        # Claude API（リライト処理）
GOOGLE_SEARCH_CONSOLE_KEY=xxxxx       # Search Console（順位取得）
SLACK_BOT_TOKEN=xoxb-xxxxx           # Slack通知
DATABASE_URL=postgresql://xxxxx       # PostgreSQL
```

### 2. データベース設計

```sql
-- 記事テーブル
CREATE TABLE articles (
  id SERIAL PRIMARY KEY,
  url VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT[],
  current_ranking INTEGER,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr DECIMAL(5,4),
  published_at TIMESTAMP,
  last_updated_at TIMESTAMP,
  last_rewritten_at TIMESTAMP,
  rewrite_count INTEGER DEFAULT 0,
  cv_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 社内情報テーブル
CREATE TABLE company_info (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100),
  title VARCHAR(255),
  content TEXT,
  is_confidential BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,
  source VARCHAR(255),
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

-- リライト履歴テーブル
CREATE TABLE rewrite_history (
  id SERIAL PRIMARY KEY,
  article_id INTEGER REFERENCES articles(id),
  before_title VARCHAR(255),
  after_title VARCHAR(255),
  before_content TEXT,
  after_content TEXT,
  added_faq TEXT,
  internal_links TEXT[],
  quality_score INTEGER,
  rewritten_by VARCHAR(100),
  rewritten_at TIMESTAMP DEFAULT NOW()
);

-- FAQ テンプレートテーブル
CREATE TABLE faq_templates (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(255),
  question TEXT,
  answer TEXT,
  usage_count INTEGER DEFAULT 0
);
```

## 🚀 実装ステップ

### Step 1: プロジェクトセットアップ
```bash
# パッケージインストール
npm install @anthropic-ai/sdk googleapis @slack/web-api prisma dotenv
npm install -D @types/node typescript tsx nodemon

# Prisma初期化
npx prisma init

# TypeScript設定
npx tsc --init
```

### Step 2: Prisma Schema定義
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Article {
  id              Int      @id @default(autoincrement())
  url             String   @unique
  title           String
  content         String   @db.Text
  keywords        String[]
  currentRanking  Int?
  clicks          Int      @default(0)
  impressions     Int      @default(0)
  ctr             Decimal? @db.Decimal(5,4)
  publishedAt     DateTime
  lastUpdatedAt   DateTime?
  lastRewrittenAt DateTime?
  rewriteCount    Int      @default(0)
  cvCount         Int      @default(0)
  createdAt       DateTime @default(now())
  
  rewriteHistory  RewriteHistory[]
}

model CompanyInfo {
  id             Int      @id @default(autoincrement())
  category       String
  title          String
  content        String   @db.Text
  isConfidential Boolean  @default(false)
  isPublic       Boolean  @default(false)
  source         String?
  tags           String[]
  createdAt      DateTime @default(now())
}

model RewriteHistory {
  id            Int      @id @default(autoincrement())
  articleId     Int
  beforeTitle   String
  afterTitle    String
  beforeContent String   @db.Text
  afterContent  String   @db.Text
  addedFaq      String?  @db.Text
  internalLinks String[]
  qualityScore  Int?
  rewrittenBy   String
  rewrittenAt   DateTime @default(now())
  
  article       Article  @relation(fields: [articleId], references: [id])
}
```

### Step 3: 本番用RewriteAgent実装
```typescript
// src/agents/RewriteAgent.ts
import { Anthropic } from '@anthropic-ai/sdk';
import { google } from 'googleapis';
import { WebClient } from '@slack/web-api';
import { PrismaClient } from '@prisma/client';

export class RewriteAgent {
  private anthropic: Anthropic;
  private searchConsole: any;
  private slack: WebClient;
  private prisma: PrismaClient;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!
    });
    
    this.slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.prisma = new PrismaClient();
    
    // Search Console認証
    this.initSearchConsole();
  }

  // リライト条件判定
  async shouldRewrite(article: any): boolean {
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(article.lastUpdatedAt || article.publishedAt).getTime()) 
      / (1000 * 60 * 60 * 24)
    );
    
    return (
      daysSinceUpdate >= 90 && // 90日以上更新なし
      article.currentRanking > 3 && // 3位より下
      article.currentRanking <= 20 && // 20位以内
      article.impressions > 1000 // ある程度の表示回数
    );
  }

  // メイン処理
  async processArticle(articleId: number): Promise<void> {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId }
    });
    
    if (!article || !await this.shouldRewrite(article)) {
      return;
    }

    // 1. 社内情報取得
    const companyInfo = await this.fetchRelevantCompanyInfo(article.keywords);
    
    // 2. コンテンツリライト
    const rewrittenContent = await this.rewriteContent(
      article.content,
      companyInfo,
      article.keywords
    );
    
    // 3. FAQ生成
    const faq = await this.generateFAQ(rewrittenContent, article.keywords);
    
    // 4. 校閲・匿名化
    const reviewedContent = await this.reviewAndAnonymize(
      rewrittenContent + faq,
      companyInfo
    );
    
    // 5. 内部リンク追加
    const finalContent = await this.addInternalLinks(reviewedContent);
    
    // 6. タイトル最適化
    const newTitle = await this.optimizeTitle(
      article.title,
      finalContent,
      article.keywords
    );
    
    // 7. DB更新
    await this.updateArticle(articleId, newTitle, finalContent);
    
    // 8. Slack通知
    await this.notifySlack(article, newTitle);
  }

  // バッチ処理
  async processAllArticles(): Promise<void> {
    const articles = await this.prisma.article.findMany({
      where: {
        currentRanking: {
          gt: 3,
          lte: 20
        }
      }
    });

    console.log(`📝 ${articles.length}件の記事をリライト対象として検出`);

    for (const article of articles) {
      if (await this.shouldRewrite(article)) {
        console.log(`🔄 リライト開始: ${article.title}`);
        await this.processArticle(article.id);
        
        // API制限対策で間隔を空ける
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
}
```

## 📦 必要なパッケージまとめ

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.20.0",
    "@slack/web-api": "^7.0.0",
    "googleapis": "^126.0.0",
    "@prisma/client": "^5.0.0",
    "prisma": "^5.0.0",
    "dotenv": "^16.0.0",
    "express": "^4.18.0",
    "node-cron": "^3.0.0"
  }
}
```

## ⚙️ 実行スケジュール設定

```typescript
// src/scheduler.ts
import cron from 'node-cron';
import { RewriteAgent } from './agents/RewriteAgent';

// 毎日午前3時に実行
cron.schedule('0 3 * * *', async () => {
  console.log('🚀 リライトエージェント開始');
  const agent = new RewriteAgent();
  await agent.processAllArticles();
  console.log('✅ リライトエージェント完了');
});
```

## 🔐 セキュリティ設定

```typescript
// 機密情報の匿名化ルール
const ANONYMIZATION_RULES = {
  company_name: /株式会社\w+/g,
  person_name: /[氏名]\w{2,4}様/g,
  specific_number: /\d{2,}[%万円]/g,
  email: /[\w\.-]+@[\w\.-]+\.\w+/g,
  phone: /\d{2,4}-\d{2,4}-\d{4}/g
};
```

## 📊 モニタリング

```typescript
// ダッシュボードエンドポイント
app.get('/api/rewrite/stats', async (req, res) => {
  const stats = await prisma.article.aggregate({
    _count: true,
    _avg: { currentRanking: true },
    where: {
      lastRewrittenAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }
    }
  });
  res.json(stats);
});
```

## 次のアクション

1. **まずDB設定**
```bash
npx prisma migrate dev --name init
```

2. **APIキー設定**
```bash
cp .env.example .env
# .envファイルにAPIキー記入
```

3. **テスト実行**
```bash
npm run dev:rewrite
```

準備できた？始めよう！
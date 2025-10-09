import { PrismaClient } from '@prisma/client';
import { ClaudeService } from '../services/ClaudeService';
import { SearchConsoleService } from '../services/SearchConsoleService';
import { SlackService } from '../services/SlackService';
import { AnonymizationService } from '../services/AnonymizationService';

export class RewriteAgent {
  private prisma: PrismaClient;
  private claude: ClaudeService;
  private searchConsole: SearchConsoleService;
  private slack: SlackService;
  private anonymizer: AnonymizationService;

  constructor() {
    this.prisma = new PrismaClient();
    this.claude = new ClaudeService();
    this.searchConsole = new SearchConsoleService();
    this.slack = new SlackService();
    this.anonymizer = new AnonymizationService();
  }

  // リライト条件判定
  shouldRewrite(article: any): boolean {
    // 最終更新からの経過日数
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(article.lastUpdatedAt || article.publishedAt).getTime()) 
      / (1000 * 60 * 60 * 24)
    );

    // リライト条件
    const conditions = {
      minDaysSinceUpdate: 90,      // 90日以上更新なし
      minRanking: 3,                // 3位以下（変更: 5位も含む）
      maxRanking: 20,               // 20位以内
      minImpressions: 1000,         // 最低表示回数
      maxCtr: 0.10                  // CTR 10%以下（変更: より緩い条件）
    };

    return (
      daysSinceUpdate >= conditions.minDaysSinceUpdate &&
      article.currentRanking >= conditions.minRanking &&
      article.currentRanking <= conditions.maxRanking &&
      article.impressions >= conditions.minImpressions &&
      (!article.ctr || article.ctr <= conditions.maxCtr)
    );
  }

  // メイン処理
  async processArticle(articleId: number): Promise<any> {
    const startTime = Date.now();
    console.log(`🔄 記事ID ${articleId} のリライト開始`);

    try {
      // 1. 記事データ取得
      const article = await this.prisma.article.findUnique({
        where: { id: articleId },
        include: { rewriteHistory: true }
      });

      if (!article) {
        throw new Error(`記事が見つかりません: ID ${articleId}`);
      }

      // 2. リライト条件チェック
      if (!this.shouldRewrite(article)) {
        console.log(`⏭️ リライト条件を満たしていません: ${article.title}`);
        return null;
      }

      // 3. 社内情報取得
      const companyInfo = await this.fetchCompanyInfo(article.keywords.split(','));
      console.log(`📚 関連する社内情報: ${companyInfo.length}件`);

      // 4. コンテンツリライト
      console.log('📝 コンテンツをリライト中...');
      const rewrittenContent = await this.claude.rewriteContent(
        article.content,
        companyInfo,
        article.keywords.split(',')
      );

      // 5. FAQ生成
      console.log('❓ FAQを生成中...');
      const faqSection = await this.claude.generateFAQ(
        rewrittenContent,
        article.keywords.split(',')
      );

      // 6. 匿名化処理
      console.log('🔒 機密情報を匿名化中...');
      const anonymizedContent = await this.anonymizer.anonymize(
        rewrittenContent + '\n\n' + faqSection,
        companyInfo
      );

      // 7. 校閲
      console.log('✏️ 校閲中...');
      const reviewedContent = await this.claude.reviewContent(anonymizedContent);

      // 8. 内部リンク追加
      console.log('🔗 内部リンクを追加中...');
      const finalContent = await this.addInternalLinks(reviewedContent, article.id);

      // 9. タイトル最適化
      console.log('🎯 タイトルを最適化中...');
      const newTitle = await this.claude.refineTitle(
        article.title,
        finalContent,
        article.keywords.split(',')
      );

      // 10. 品質スコア算出
      const qualityScore = await this.claude.calculateQualityScore(finalContent);
      console.log(`⭐ 品質スコア: ${qualityScore}点`);

      // 11. データベース更新
      await this.updateArticle(
        article,
        newTitle,
        finalContent,
        faqSection,
        qualityScore
      );

      // 12. 処理結果を返す
      const processingTime = (Date.now() - startTime) / 1000;
      console.log(`✅ リライト完了: ${newTitle} (処理時間: ${processingTime}秒)`);

      return {
        articleId: article.id,
        originalTitle: article.title,
        newTitle,
        qualityScore,
        processingTime,
        faqAdded: !!faqSection,
        contentLength: finalContent.length
      };

    } catch (error) {
      console.error(`❌ リライトエラー (記事ID: ${articleId}):`, error);
      
      // エラー記録
      await this.prisma.rewriteTask.create({
        data: {
          articleId,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          scheduledAt: new Date(),
          startedAt: new Date(startTime),
          completedAt: new Date()
        }
      });

      // Slack通知
      await this.slack.sendErrorNotification(
        error instanceof Error ? error.message : String(error)
      );

      throw error;
    }
  }

  // 社内情報取得
  private async fetchCompanyInfo(keywords: string[]): Promise<any[]> {
    const companyInfo = await this.prisma.companyInfo.findMany({
      where: {
        OR: [
          { tags: { contains: keywords.join('|') } },
          { category: { in: keywords } }
        ]
      },
      take: 10
    });

    return companyInfo;
  }

  // 内部リンク追加
  private async addInternalLinks(content: string, currentArticleId: number): Promise<string> {
    // 関連記事を取得
    const relatedArticles = await this.prisma.article.findMany({
      where: {
        id: { not: currentArticleId },
        currentRanking: { lte: 10 }
      },
      select: {
        id: true,
        title: true,
        url: true,
        keywords: true
      },
      take: 10
    });

    // リンク提案を取得
    const linkSuggestions = await this.claude.suggestInternalLinks(
      content,
      relatedArticles
    );

    // リンクを適用
    let linkedContent = content;
    for (const suggestion of linkSuggestions) {
      linkedContent = linkedContent.replace(
        suggestion.anchorText,
        `[${suggestion.anchorText}](${suggestion.url})`,
        1
      );
    }

    return linkedContent;
  }

  // データベース更新
  private async updateArticle(
    article: any,
    newTitle: string,
    newContent: string,
    faqSection: string,
    qualityScore: number
  ): Promise<void> {
    // リライト履歴を保存
    await this.prisma.rewriteHistory.create({
      data: {
        articleId: article.id,
        beforeTitle: article.title,
        afterTitle: newTitle,
        beforeContent: article.content,
        afterContent: newContent,
        addedFaq: faqSection,
        internalLinks: JSON.stringify([]), // TODO: 実際のリンクリストを保存
        qualityScore,
        rewrittenBy: 'RewriteAgent-v1.0'
      }
    });

    // 記事を更新
    await this.prisma.article.update({
      where: { id: article.id },
      data: {
        title: newTitle,
        content: newContent,
        lastRewrittenAt: new Date(),
        rewriteCount: { increment: 1 }
      }
    });
  }

  // バッチ処理
  async processAllArticles(): Promise<void> {
    const startTime = Date.now();
    console.log('🚀 リライトエージェント バッチ処理開始');

    // Search Consoleデータを更新
    await this.searchConsole.updateArticlesPerformance();

    // リライト候補を取得
    const candidates = await this.searchConsole.getRewriteCandidates();
    console.log(`📋 リライト候補: ${candidates.length}件`);

    const results = [];
    const designRequests = [];

    for (const candidate of candidates) {
      try {
        const result = await this.processArticle(candidate.id);
        if (result) {
          results.push(result);

          // 図解依頼用データを収集
          designRequests.push({
            articleTitle: result.newTitle,
            articleUrl: candidate.url,
            keyPoints: this.extractKeyPoints(result.newContent),
            suggestedGraphics: this.suggestGraphics(result.newContent)
          });
        }

        // API制限対策
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`記事 ${candidate.id} の処理失敗:`, error);
      }
    }

    // Slack通知送信
    if (designRequests.length > 0) {
      await this.slack.sendDesignRequest(designRequests);
    }

    // サマリー送信
    const processingTime = Date.now() - startTime;
    const stats = {
      totalRewritten: results.length,
      totalFaqAdded: results.filter(r => r.faqAdded).length,
      averageQualityScore: Math.round(
        results.reduce((acc, r) => acc + r.qualityScore, 0) / results.length
      ),
      processingTime: processingTime / 1000
    };

    await this.slack.sendDailySummary(stats);

    console.log('✅ バッチ処理完了');
    console.log(`  - 処理記事数: ${stats.totalRewritten}`);
    console.log(`  - 平均品質スコア: ${stats.averageQualityScore}`);
    console.log(`  - 処理時間: ${Math.round(stats.processingTime / 60)}分`);
  }

  // キーポイント抽出（ダミー実装）
  private extractKeyPoints(content: string): string[] {
    // 実際には自然言語処理で重要ポイントを抽出
    return [
      'データの可視化が重要',
      'ユーザー体験の向上',
      'SEO効果の最大化'
    ];
  }

  // グラフィック提案（ダミー実装）
  private suggestGraphics(content: string): string[] {
    // 実際にはコンテンツ分析して適切なグラフィック提案
    return [
      '比較表',
      'フローチャート',
      'インフォグラフィック'
    ];
  }

  // クリーンアップ
  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
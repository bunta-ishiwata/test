import { Agent, AgentConfig, AgentResult } from '../core/Agent';
import { ArticleDB, CompanyDB } from '../database';
import { SlackClient } from '../integrations/slack';
import { SearchConsoleAPI } from '../integrations/google';

interface RewriteTaskInput {
  articleId: string;
  articleUrl: string;
  currentTitle: string;
  currentContent: string;
  targetKeywords: string[];
  currentRanking?: number;
}

interface RewriteResult extends AgentResult {
  rewrittenTitle: string;
  rewrittenContent: string;
  addedFAQ: string;
  internalLinks: string[];
  anonymizedSources: string[];
  rewriteDate: Date;
}

export class RewriteAgent extends Agent {
  private articleDB: ArticleDB;
  private companyDB: CompanyDB;
  private slackClient: SlackClient;

  constructor(config: AgentConfig) {
    super(config);
    this.articleDB = new ArticleDB();
    this.companyDB = new CompanyDB();
    this.slackClient = new SlackClient(process.env.SLACK_TOKEN);
  }

  async execute(input: RewriteTaskInput): Promise<RewriteResult> {
    this.log('Starting article rewrite process');

    // 1. 社内情報DBから関連情報取得
    const companyInfo = await this.fetchCompanyInfo(input.targetKeywords);
    
    // 2. 記事内容をAIでリライト（社内情報を含む）
    const rewrittenContent = await this.rewriteContent(
      input.currentContent, 
      companyInfo,
      input.targetKeywords
    );

    // 3. FAQ自動生成・追加
    const faqSection = await this.generateFAQ(rewrittenContent, input.targetKeywords);

    // 4. 校閲処理（匿名化含む）
    const reviewedContent = await this.reviewContent(
      rewrittenContent + faqSection,
      companyInfo
    );

    // 5. 内部リンク自動追加
    const contentWithLinks = await this.addInternalLinks(reviewedContent);

    // 6. タイトルのセルフリファイン
    const newTitle = await this.refineTitle(
      input.currentTitle,
      contentWithLinks,
      input.targetKeywords
    );

    // 7. 記事DBに更新情報記録
    await this.updateArticleDB(input.articleId, {
      title: newTitle,
      content: contentWithLinks,
      rewriteDate: new Date(),
      lastRewriteAgent: 'RewriteAgent-v1'
    });

    // 8. 完了後の処理
    const result: RewriteResult = {
      success: true,
      rewrittenTitle: newTitle,
      rewrittenContent: contentWithLinks,
      addedFAQ: faqSection,
      internalLinks: await this.extractInternalLinks(contentWithLinks),
      anonymizedSources: companyInfo.filter(info => info.isConfidential).map(info => info.id),
      rewriteDate: new Date(),
      score: await this.calculateQualityScore(contentWithLinks)
    };

    this.log(`Rewrite completed: ${newTitle}`);
    return result;
  }

  private async fetchCompanyInfo(keywords: string[]): Promise<any[]> {
    // 社内DBから関連情報を取得
    const relevantInfo = await this.companyDB.search({
      keywords,
      includeConfidential: true
    });
    return relevantInfo;
  }

  private async rewriteContent(
    originalContent: string,
    companyInfo: any[],
    keywords: string[]
  ): Promise<string> {
    // Claude APIを使用してコンテンツリライト
    const prompt = `
      以下の記事を社内情報を活用してリライトしてください：
      - ターゲットキーワード: ${keywords.join(', ')}
      - 社内情報を自然に組み込む
      - SEO最適化を意識
      - 読みやすさを向上
      
      元記事: ${originalContent}
      社内情報: ${JSON.stringify(companyInfo)}
    `;
    
    return await this.callClaudeAPI(prompt);
  }

  private async generateFAQ(content: string, keywords: string[]): Promise<string> {
    // FAQ自動生成
    const prompt = `
      以下の記事内容から、よくある質問（FAQ）を5つ生成してください：
      - 記事内容: ${content}
      - キーワード: ${keywords.join(', ')}
      
      フォーマット:
      ## よくある質問
      Q1: [質問]
      A1: [回答]
    `;
    
    return await this.callClaudeAPI(prompt);
  }

  private async reviewContent(content: string, companyInfo: any[]): Promise<string> {
    // 校閲処理（機密情報の匿名化含む）
    let reviewedContent = content;
    
    // 機密情報のチェックと匿名化
    for (const info of companyInfo) {
      if (info.isConfidential && !info.isPublic) {
        // 具体的な数値や固有名詞を匿名化
        reviewedContent = reviewedContent.replace(
          new RegExp(info.originalText, 'g'),
          this.anonymize(info.originalText, info.type)
        );
      }
    }
    
    // 文法チェック、誤字脱字修正
    const grammarCheck = await this.callClaudeAPI(`
      以下の文章の文法、誤字脱字をチェックして修正してください：
      ${reviewedContent}
    `);
    
    return grammarCheck;
  }

  private anonymize(text: string, type: string): string {
    // タイプに応じた匿名化処理
    switch(type) {
      case 'company_name':
        return '某大手企業';
      case 'specific_number':
        return '約XX%';
      case 'person_name':
        return '関係者';
      default:
        return '[非公開情報]';
    }
  }

  private async addInternalLinks(content: string): Promise<string> {
    // 関連する公開記事の内部リンクを追加
    const relatedArticles = await this.articleDB.findRelated(content);
    let updatedContent = content;
    
    for (const article of relatedArticles) {
      // 適切なアンカーテキストで内部リンク追加
      const anchorText = await this.findBestAnchorText(content, article);
      if (anchorText) {
        updatedContent = updatedContent.replace(
          anchorText,
          `[${anchorText}](${article.url})`,
          1 // 最初の1箇所のみ置換
        );
      }
    }
    
    return updatedContent;
  }

  private async refineTitle(
    currentTitle: string,
    content: string,
    keywords: string[]
  ): Promise<string> {
    // セルフリファインでタイトル改善
    let title = currentTitle;
    
    for (let i = 0; i < 3; i++) {
      const refinedTitle = await this.callClaudeAPI(`
        以下のタイトルをより良く改善してください：
        現在のタイトル: ${title}
        記事内容: ${content.substring(0, 500)}...
        ターゲットキーワード: ${keywords.join(', ')}
        
        改善ポイント:
        - CTRを高める
        - キーワードを自然に含める
        - 32文字以内
      `);
      
      // スコアリングして改善されていれば更新
      if (await this.isBetterTitle(refinedTitle, title, keywords)) {
        title = refinedTitle;
      } else {
        break;
      }
    }
    
    return title;
  }

  private async processAllArticles(): Promise<void> {
    // リライト条件に合致する記事を全て処理
    const articlesToRewrite = await this.articleDB.findArticlesForRewrite({
      minDaysSinceUpdate: 90,
      maxRanking: 20,
      minRanking: 4
    });

    const results = [];
    for (const article of articlesToRewrite) {
      const result = await this.execute({
        articleId: article.id,
        articleUrl: article.url,
        currentTitle: article.title,
        currentContent: article.content,
        targetKeywords: article.keywords,
        currentRanking: article.ranking
      });
      results.push(result);
    }

    // Slack通知（図解依頼をまとめて送信）
    await this.sendSlackNotification(results);
  }

  private async sendSlackNotification(results: RewriteResult[]): Promise<void> {
    // 図解依頼をまとめてSlackに送信
    const message = {
      channel: process.env.SLACK_DESIGN_CHANNEL || '#design-requests',
      text: '📊 本日のリライト完了記事（図解依頼）',
      blocks: results.map(result => ({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• *${result.rewrittenTitle}*\n  重要ポイント: ${this.extractKeyPoints(result.rewrittenContent)}`
        }
      }))
    };

    await this.slackClient.postMessage(message);
  }

  private extractKeyPoints(content: string): string {
    // 記事から図解すべき重要ポイントを抽出
    // 実装省略
    return 'データ比較、プロセスフロー';
  }

  private async calculateQualityScore(content: string): Promise<number> {
    // コンテンツ品質スコア計算
    // SEO、可読性、情報量などを評価
    return 85;
  }

  private async isBetterTitle(newTitle: string, oldTitle: string, keywords: string[]): Promise<boolean> {
    // タイトル改善判定ロジック
    return true;
  }

  private async findBestAnchorText(content: string, article: any): Promise<string | null> {
    // 最適なアンカーテキスト検索
    return null;
  }

  private async extractInternalLinks(content: string): Promise<string[]> {
    // 内部リンク抽出
    return [];
  }

  private async updateArticleDB(articleId: string, updates: any): Promise<void> {
    // DB更新
    await this.articleDB.update(articleId, updates);
  }

  private async callClaudeAPI(prompt: string): Promise<string> {
    // Claude API呼び出し（実装省略）
    return '';
  }
}
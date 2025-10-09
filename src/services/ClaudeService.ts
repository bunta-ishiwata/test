import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

dotenv.config();

export class ClaudeService {
  private anthropic: Anthropic;

  constructor() {
    // デモモード: APIキーが無効な場合はモック動作
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.anthropic = apiKey && !apiKey.includes('XXXXX') 
      ? new Anthropic({ apiKey })
      : null as any; // モックモード
  }

  // 記事リライト処理
  async rewriteContent(
    originalContent: string,
    companyInfo: any[],
    keywords: string[]
  ): Promise<string> {
    // モックモードの場合
    if (!this.anthropic) {
      return this.mockRewriteContent(originalContent, companyInfo, keywords);
    }
    
    try {
      const prompt = `あなたはSEOライティングの専門家です。以下の記事を改善してください。

【改善のポイント】
1. ターゲットキーワードを自然に組み込む
2. 社内情報を活用して独自性を高める
3. 読みやすさと情報量のバランスを取る
4. SEO効果を最大化する
5. E-E-A-T（経験・専門性・権威性・信頼性）を強化

【ターゲットキーワード】
${keywords.join(', ')}

【活用可能な社内情報】
${companyInfo.map(info => `- ${info.title}: ${info.content.substring(0, 200)}...`).join('\n')}

【元記事】
${originalContent}

【要求事項】
- 文字数は元記事の1.2倍程度
- 小見出し（##）を効果的に使用
- 具体的な数値やデータを追加
- 社内情報を自然に織り込む
- 結論を明確にする

改善した記事を出力してください：`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      return response.content[0].type === 'text' 
        ? response.content[0].text 
        : originalContent;
    } catch (error) {
      console.error('Claude APIエラー:', error);
      throw error;
    }
  }

  // FAQ自動生成
  async generateFAQ(content: string, keywords: string[]): Promise<string> {
    if (!this.anthropic) {
      // モックモード
      return `## よくある質問\n\n### Q1: ${keywords[0]}とは何ですか？\nA1: ${keywords[0]}は、重要な概念です。本記事で詳しく解説しています。\n\n### Q2: ${keywords[0]}のメリットは？\nA2: 効率化、コスト削減、品質向上などが期待できます。\n\n### Q3: 導入時の注意点は？\nA3: 段階的な導入と効果測定が重要です。`;
    }
    
    try {
      const prompt = `以下の記事内容から、よくある質問（FAQ）を5つ生成してください。

【記事内容】
${content.substring(0, 2000)}...

【ターゲットキーワード】
${keywords.join(', ')}

【要求事項】
- 読者が実際に疑問に思いそうな質問を選ぶ
- 回答は簡潔かつ具体的に
- キーワードを自然に含める
- 構造化データマークアップを意識した形式で

以下の形式で出力してください：

## よくある質問

### Q1: [質問文]
A1: [回答文]

### Q2: [質問文]
A2: [回答文]

（以下同様）`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        temperature: 0.8,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      return response.content[0].type === 'text' 
        ? response.content[0].text 
        : '';
    } catch (error) {
      console.error('FAQ生成エラー:', error);
      return '';
    }
  }

  // タイトルのセルフリファイン
  async refineTitle(
    currentTitle: string,
    content: string,
    keywords: string[],
    iteration: number = 1
  ): Promise<string> {
    if (!this.anthropic) {
      // モックモード
      return `【2024年最新】${keywords[0]}完全ガイド｜実践的な${keywords.length}つのポイント`;
    }
    
    try {
      const prompt = `記事タイトルを改善してください（改善回数: ${iteration}/3）

【現在のタイトル】
${currentTitle}

【記事内容の要約】
${content.substring(0, 500)}...

【ターゲットキーワード】
${keywords.join(', ')}

【改善のポイント】
- CTRを高める魅力的な表現
- 32文字以内に収める
- キーワードを自然に含める
- 数字を使って具体性を出す
- 読者のベネフィットを明確にする

${iteration > 1 ? '前回より更に改善してください。' : ''}

改善したタイトル（1つだけ）：`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 100,
        temperature: 0.9,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const newTitle = response.content[0].type === 'text' 
        ? response.content[0].text.trim()
        : currentTitle;

      // セルフリファイン（最大3回）
      if (iteration < 3) {
        const isImproved = await this.evaluateTitle(newTitle, currentTitle, keywords);
        if (!isImproved) {
          return await this.refineTitle(newTitle, content, keywords, iteration + 1);
        }
      }

      return newTitle;
    } catch (error) {
      console.error('タイトル改善エラー:', error);
      return currentTitle;
    }
  }

  // タイトル評価
  private async evaluateTitle(
    newTitle: string,
    oldTitle: string,
    keywords: string[]
  ): Promise<boolean> {
    try {
      const prompt = `以下の2つのタイトルを比較評価してください。

タイトルA: ${oldTitle}
タイトルB: ${newTitle}

キーワード: ${keywords.join(', ')}

評価基準：
1. キーワードの含有
2. クリック率（CTR）の期待値
3. 文字数（32文字以内が理想）
4. 具体性と魅力

タイトルBの方が優れている場合は "true"、そうでない場合は "false" と回答してください。
回答（true/false）：`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 10,
        temperature: 0,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const result = response.content[0].type === 'text' 
        ? response.content[0].text.trim().toLowerCase()
        : 'false';

      return result === 'true';
    } catch (error) {
      console.error('タイトル評価エラー:', error);
      return true; // エラー時は新タイトルを採用
    }
  }

  // 内部リンク提案
  async suggestInternalLinks(
    content: string,
    relatedArticles: any[]
  ): Promise<{ anchorText: string; url: string }[]> {
    if (relatedArticles.length === 0) return [];
    
    if (!this.anthropic) {
      // モックモード
      return relatedArticles.slice(0, 2).map(article => ({
        anchorText: article.title.substring(0, 20),
        url: article.url
      }));
    }

    try {
      const prompt = `以下の記事内容に対して、関連記事への内部リンクを提案してください。

【記事内容】
${content.substring(0, 1500)}...

【リンク可能な関連記事】
${relatedArticles.map((a, i) => `${i + 1}. ${a.title} (URL: ${a.url})`).join('\n')}

【要求事項】
- 文脈に自然に溶け込むアンカーテキストを選ぶ
- 最大5つまで
- リンクの位置が偏らないようにする

以下のJSON形式で出力してください：
[
  {
    "anchorText": "アンカーテキスト（記事内の実際の文章）",
    "url": "リンク先URL"
  }
]`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        temperature: 0.5,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const text = response.content[0].type === 'text' 
        ? response.content[0].text 
        : '[]';
      
      try {
        return JSON.parse(text);
      } catch {
        return [];
      }
    } catch (error) {
      console.error('内部リンク提案エラー:', error);
      return [];
    }
  }

  // 校閲処理
  async reviewContent(content: string): Promise<string> {
    if (!this.anthropic) {
      // モックモード: そのまま返す
      return content;
    }
    
    try {
      const prompt = `以下の文章を校閲してください。

【校閲のポイント】
1. 誤字脱字の修正
2. 文法的な誤りの修正
3. 読みやすさの改善
4. 不自然な表現の修正
5. 専門用語の統一

【文章】
${content}

校閲済みの文章を出力してください：`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      return response.content[0].type === 'text' 
        ? response.content[0].text 
        : content;
    } catch (error) {
      console.error('校閲エラー:', error);
      return content;
    }
  }

  // モック用のリライト処理
  private mockRewriteContent(originalContent: string, companyInfo: any[], keywords: string[]): string {
    const keywordText = keywords.join('、');
    const companyInfoText = companyInfo.length > 0 
      ? `\n\n【独自情報】\n${companyInfo[0]?.title || '社内データ'}を活用した内容を追加しました。`
      : '';
    
    return `# ${keywords[0]}の完全ガイド【2024年最新版】\n\n${originalContent}\n\n## ポイント\n\n本記事では「${keywordText}」について詳しく解説しました。${companyInfoText}\n\n## まとめ\n\n${keywords[0]}を効果的に活用することで、大きな成果が期待できます。`;
  }
  
  // コンテンツ品質スコア算出
  async calculateQualityScore(content: string): Promise<number> {
    if (!this.anthropic) {
      // モックモード: コンテンツ長に基づいてスコアを返す
      return Math.min(95, 70 + Math.floor(content.length / 100));
    }
    
    try {
      const prompt = `以下の記事の品質を100点満点で評価してください。

【評価基準】
- 情報の正確性と信頼性（25点）
- SEO最適化度（25点）
- 読みやすさと構成（25点）
- 独自性と価値（25点）

【記事】
${content.substring(0, 2000)}...

点数のみを数字で回答してください（例: 85）：`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 10,
        temperature: 0,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const scoreText = response.content[0].type === 'text' 
        ? response.content[0].text.trim()
        : '75';
      
      const score = parseInt(scoreText);
      return isNaN(score) ? 75 : Math.min(100, Math.max(0, score));
    } catch (error) {
      console.error('品質スコア算出エラー:', error);
      return 75;
    }
  }
}
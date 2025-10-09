export class AnonymizationService {
  // 匿名化ルール定義
  private anonymizationRules = {
    // 会社名
    companyName: {
      pattern: /株式会社[\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff]+|[\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff]+株式会社|[\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff]+\s*(Inc\.|Corp\.|Co\.,?\s*Ltd\.?)/g,
      replacement: '某大手企業'
    },
    
    // 個人名
    personName: {
      pattern: /[田中|佐藤|鈴木|高橋|渡辺|伊藤|山本|中村|小林|加藤][\u4e00-\u9faf]{1,3}[様|さん|氏|社長|部長|課長|主任]/g,
      replacement: '担当者'
    },
    
    // メールアドレス
    email: {
      pattern: /[\w\.-]+@[\w\.-]+\.\w+/g,
      replacement: 'contact@example.com'
    },
    
    // 電話番号
    phone: {
      pattern: /0\d{1,4}-\d{1,4}-\d{4}|0\d{9,10}/g,
      replacement: '0XX-XXXX-XXXX'
    },
    
    // 具体的な数値（売上、シェアなど）
    specificNumbers: {
      pattern: /(\d{1,3},?)+(億|万)?円の売上|売上(\d{1,3},?)+(億|万)?円|シェア\d+(\.\d+)?%|前年比\d+(\.\d+)?%/g,
      replacement: (match: string) => {
        if (match.includes('億円')) return '数十億円規模の売上';
        if (match.includes('万円')) return '数千万円規模の売上';
        if (match.includes('シェア')) return '業界トップクラスのシェア';
        if (match.includes('前年比')) return '前年比大幅増';
        return '非公開';
      }
    },
    
    // 住所
    address: {
      pattern: /〒\d{3}-\d{4}.*?[\u4e00-\u9faf]+[都道府県].*?[\u4e00-\u9faf\d\-]+/g,
      replacement: '本社所在地'
    },
    
    // 製品名・サービス名（固有名詞）
    productName: {
      pattern: /「[\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff\w\s]+」/g,
      replacement: (match: string) => {
        // 製品カテゴリを推定して汎用的な表現に変換
        if (match.includes('システム') || match.includes('ソフト')) return '「独自開発システム」';
        if (match.includes('サービス')) return '「自社サービス」';
        return '「自社製品」';
      }
    }
  };

  // メイン匿名化処理
  async anonymize(content: string, companyInfo: any[]): Promise<string> {
    let anonymizedContent = content;

    // 機密情報フラグが立っている社内情報を特別処理
    for (const info of companyInfo) {
      if (info.isConfidential && !info.isPublic) {
        // 特定の機密情報を完全に削除または汎用表現に置換
        const sensitivePattern = new RegExp(this.escapeRegex(info.title), 'g');
        anonymizedContent = anonymizedContent.replace(
          sensitivePattern,
          this.getGenericReplacement(info.category)
        );
      }
    }

    // 標準的な匿名化ルールを適用
    for (const [key, rule] of Object.entries(this.anonymizationRules)) {
      if (typeof rule.replacement === 'string') {
        anonymizedContent = anonymizedContent.replace(rule.pattern, rule.replacement);
      } else if (typeof rule.replacement === 'function') {
        anonymizedContent = anonymizedContent.replace(rule.pattern, rule.replacement);
      }
    }

    // 数値の曖昧化
    anonymizedContent = this.obscureNumbers(anonymizedContent);

    // 日付の汎用化
    anonymizedContent = this.generalizeDates(anonymizedContent);

    return anonymizedContent;
  }

  // 数値を曖昧化
  private obscureNumbers(content: string): string {
    // 1000万円以上の金額を曖昧化
    content = content.replace(/(\d{4,})(万円)/g, (match, num) => {
      const value = parseInt(num);
      if (value >= 10000) return '数億円';
      if (value >= 1000) return '数千万円';
      return match;
    });

    // パーセンテージの曖昧化
    content = content.replace(/(\d{2,3})(\.\d+)?%/g, (match, num) => {
      const value = parseInt(num);
      if (value >= 80) return '80%以上';
      if (value >= 50) return '50%以上';
      if (value >= 30) return '約30-50%';
      if (value >= 10) return '10%以上';
      return '10%未満';
    });

    return content;
  }

  // 日付を汎用化
  private generalizeDates(content: string): string {
    // 具体的な日付を月単位に
    content = content.replace(
      /20\d{2}年\d{1,2}月\d{1,2}日/g,
      (match) => {
        const yearMonth = match.match(/20\d{2}年\d{1,2}月/);
        return yearMonth ? yearMonth[0] : match;
      }
    );

    // 古い年度を相対表現に
    const currentYear = new Date().getFullYear();
    content = content.replace(/20\d{2}年/g, (match) => {
      const year = parseInt(match.match(/\d{4}/)![0]);
      const diff = currentYear - year;
      if (diff === 0) return '今年';
      if (diff === 1) return '昨年';
      if (diff === 2) return '一昨年';
      if (diff <= 5) return `${diff}年前`;
      return '数年前';
    });

    return content;
  }

  // カテゴリに基づく汎用表現を返す
  private getGenericReplacement(category: string): string {
    const replacements: { [key: string]: string } = {
      'financial': '財務関連情報',
      'strategic': '経営戦略情報',
      'personnel': '人事情報',
      'technical': '技術情報',
      'customer': '顧客情報',
      'partner': 'パートナー情報',
      'internal': '社内情報'
    };

    return replacements[category] || '非公開情報';
  }

  // 正規表現エスケープ
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 匿名化レベル判定
  determineAnonymizationLevel(content: string): 'high' | 'medium' | 'low' {
    let score = 0;

    // 機密度の高いキーワードをチェック
    const highRiskKeywords = [
      '売上', '利益', '収益', '損失',
      '戦略', '計画', '開発中', '未公開',
      '顧客リスト', '取引先', '契約',
      '特許', '技術', 'ノウハウ'
    ];

    for (const keyword of highRiskKeywords) {
      if (content.includes(keyword)) {
        score += 10;
      }
    }

    // 具体的な数値の存在をチェック
    if (/\d{4,}万円|\d+億円/.test(content)) score += 20;
    if (/\d+%/.test(content)) score += 10;
    if (/20\d{2}年\d{1,2}月\d{1,2}日/.test(content)) score += 5;

    // 固有名詞の数をチェック
    const properNouns = content.match(/「[^」]+」/g);
    if (properNouns) score += properNouns.length * 5;

    // スコアに基づいてレベル判定
    if (score >= 50) return 'high';
    if (score >= 20) return 'medium';
    return 'low';
  }

  // 匿名化前後の差分レポート生成
  generateAnonymizationReport(original: string, anonymized: string): {
    changedCount: number;
    removedInfo: string[];
    anonymizationLevel: string;
  } {
    const removedInfo: string[] = [];
    let changedCount = 0;

    // 各ルールでの変更を検出
    for (const [key, rule] of Object.entries(this.anonymizationRules)) {
      const matches = original.match(rule.pattern);
      if (matches) {
        changedCount += matches.length;
        removedInfo.push(`${key}: ${matches.length}件`);
      }
    }

    return {
      changedCount,
      removedInfo,
      anonymizationLevel: this.determineAnonymizationLevel(original)
    };
  }
}
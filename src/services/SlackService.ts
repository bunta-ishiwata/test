import { WebClient } from '@slack/web-api';
import * as dotenv from 'dotenv';

dotenv.config();

interface DesignRequest {
  articleTitle: string;
  articleUrl: string;
  keyPoints: string[];
  suggestedGraphics: string[];
}

export class SlackService {
  private client: WebClient;
  private designChannel: string;

  constructor() {
    this.client = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.designChannel = process.env.SLACK_CHANNEL_DESIGN || '#design-requests';
  }

  // 図解依頼を送信
  async sendDesignRequest(requests: DesignRequest[]): Promise<void> {
    try {
      const blocks = this.buildDesignRequestBlocks(requests);
      
      await this.client.chat.postMessage({
        channel: this.designChannel,
        text: `📊 本日のリライト記事の図解依頼（${requests.length}件）`,
        blocks
      });

      console.log(`✅ Slack通知送信完了: ${requests.length}件の図解依頼`);
    } catch (error) {
      console.error('Slack送信エラー:', error);
      throw error;
    }
  }

  // メッセージブロックを構築
  private buildDesignRequestBlocks(requests: DesignRequest[]): any[] {
    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 記事リライト完了 - 図解作成依頼',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*本日リライトが完了した記事の図解作成をお願いします*\n件数: ${requests.length}件`
        }
      },
      {
        type: 'divider'
      }
    ];

    requests.forEach((request, index) => {
      blocks.push(
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${index + 1}. ${request.articleTitle}*\n<${request.articleUrl}|記事を見る>`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*📌 重要ポイント*\n${request.keyPoints.map(p => `• ${p}`).join('\n')}`
            },
            {
              type: 'mrkdwn',
              text: `*🎨 推奨グラフィック*\n${request.suggestedGraphics.map(g => `• ${g}`).join('\n')}`
            }
          ]
        }
      );

      if (index < requests.length - 1) {
        blocks.push({ type: 'divider' });
      }
    });

    blocks.push(
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `⏰ 依頼日時: ${new Date().toLocaleString('ja-JP')} | 🤖 自動送信 by RewriteAgent`
          }
        ]
      }
    );

    return blocks;
  }

  // リライト完了通知
  async sendRewriteCompletionNotice(
    articleCount: number,
    improvements: { title: string; rankingChange: number }[]
  ): Promise<void> {
    try {
      const topImprovements = improvements
        .sort((a, b) => b.rankingChange - a.rankingChange)
        .slice(0, 5);

      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '✅ 記事リライト完了レポート',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*本日のリライト実績*\n• 処理記事数: ${articleCount}件\n• 予測順位改善: 平均${Math.round(improvements.reduce((acc, i) => acc + i.rankingChange, 0) / improvements.length)}位`
          }
        }
      ];

      if (topImprovements.length > 0) {
        blocks.push(
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*📈 順位改善予測TOP5*'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: topImprovements.map((item, i) => 
                `${i + 1}. ${item.title} (+${item.rankingChange}位)`
              ).join('\n')
            }
          }
        );
      }

      await this.client.chat.postMessage({
        channel: this.designChannel,
        text: `✅ 記事リライト完了: ${articleCount}件`,
        blocks
      });
    } catch (error) {
      console.error('完了通知送信エラー:', error);
    }
  }

  // エラー通知
  async sendErrorNotification(error: string, articleTitle?: string): Promise<void> {
    try {
      await this.client.chat.postMessage({
        channel: this.designChannel,
        text: '⚠️ リライトエラー',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `⚠️ *リライト処理中にエラーが発生しました*${articleTitle ? `\n記事: ${articleTitle}` : ''}\n\`\`\`${error}\`\`\``
            }
          }
        ]
      });
    } catch (slackError) {
      console.error('エラー通知送信失敗:', slackError);
    }
  }

  // 日次サマリー送信
  async sendDailySummary(stats: {
    totalRewritten: number;
    totalFaqAdded: number;
    averageQualityScore: number;
    processingTime: number;
  }): Promise<void> {
    try {
      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📊 本日のリライト実績サマリー',
            emoji: true
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*📝 リライト記事数*\n${stats.totalRewritten}件`
            },
            {
              type: 'mrkdwn',
              text: `*❓ FAQ追加数*\n${stats.totalFaqAdded}件`
            },
            {
              type: 'mrkdwn',
              text: `*⭐ 平均品質スコア*\n${stats.averageQualityScore}点`
            },
            {
              type: 'mrkdwn',
              text: `*⏱️ 処理時間*\n${Math.round(stats.processingTime / 60)}分`
            }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `🤖 RewriteAgent | ${new Date().toLocaleDateString('ja-JP')}`
            }
          ]
        }
      ];

      await this.client.chat.postMessage({
        channel: this.designChannel,
        text: '📊 本日のリライト実績',
        blocks
      });
    } catch (error) {
      console.error('サマリー送信エラー:', error);
    }
  }

  // インタラクティブボタン付きメッセージ
  async sendInteractiveMessage(article: {
    title: string;
    url: string;
    id: number;
  }): Promise<void> {
    try {
      await this.client.chat.postMessage({
        channel: this.designChannel,
        text: `リライト候補: ${article.title}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*リライト候補記事*\n${article.title}\n<${article.url}|記事を確認>`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '✅ リライト実行',
                  emoji: true
                },
                style: 'primary',
                action_id: `rewrite_${article.id}`
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '⏭️ スキップ',
                  emoji: true
                },
                action_id: `skip_${article.id}`
              }
            ]
          }
        ]
      });
    } catch (error) {
      console.error('インタラクティブメッセージ送信エラー:', error);
    }
  }
}
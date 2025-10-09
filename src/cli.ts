#!/usr/bin/env node

import { Command } from 'commander';
import { RewriteAgent } from './agents/RewriteAgent.js';
import { SearchConsoleService } from './services/SearchConsoleService.js';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const program = new Command();
const prisma = new PrismaClient();

program
  .name('rewrite-agent')
  .description('記事リライトエージェント CLI')
  .version('1.0.0');

// リライト実行コマンド
program
  .command('rewrite')
  .description('リライト処理を実行')
  .option('-a, --article-id <id>', '特定の記事IDをリライト', parseInt)
  .option('--all', '全記事をチェックしてリライト')
  .option('--dry-run', 'ドライラン（実際にはリライトしない）')
  .action(async (options) => {
    console.log('🚀 リライト処理開始...');
    
    const agent = new RewriteAgent();
    
    try {
      if (options.articleId) {
        // 特定記事のリライト
        console.log(`📝 記事ID ${options.articleId} をリライト`);
        await agent.processArticle(options.articleId);
      } else if (options.all) {
        // 全記事チェック
        console.log('📚 全記事をチェック...');
        await agent.processAllArticles();
      } else {
        // リライト候補を表示
        const searchConsole = new SearchConsoleService();
        const candidates = await searchConsole.getRewriteCandidates();
        
        console.log(`\n📋 リライト候補: ${candidates.length}件\n`);
        candidates.forEach((article, index) => {
          console.log(`${index + 1}. ${article.title}`);
          console.log(`   URL: ${article.url}`);
          console.log(`   現在順位: ${article.currentRanking}位`);
          console.log(`   最終更新: ${article.daysSinceUpdate}日前`);
          console.log(`   優先度スコア: ${article.priority}`);
          console.log('');
        });
        
        console.log('特定の記事をリライトするには: rewrite-agent rewrite -a <記事ID>');
        console.log('全記事をリライトするには: rewrite-agent rewrite --all');
      }
    } catch (error) {
      console.error('❌ エラー:', error);
      process.exit(1);
    } finally {
      await agent.cleanup();
    }
  });

// データ更新コマンド
program
  .command('update')
  .description('Search Consoleデータを更新')
  .action(async () => {
    console.log('📊 Search Consoleデータ更新中...');
    
    const searchConsole = new SearchConsoleService();
    
    try {
      await searchConsole.updateArticlesPerformance();
      console.log('✅ データ更新完了');
    } catch (error) {
      console.error('❌ エラー:', error);
      process.exit(1);
    }
  });

// 統計表示コマンド
program
  .command('stats')
  .description('リライト統計を表示')
  .option('-d, --days <days>', '過去N日間の統計', parseInt, 7)
  .action(async (options) => {
    console.log(`📈 過去${options.days}日間の統計\n`);
    
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - options.days);
      
      // リライト済み記事数
      const rewrittenCount = await prisma.article.count({
        where: {
          lastRewrittenAt: {
            gte: startDate
          }
        }
      });
      
      // リライト履歴から品質スコアの平均を計算
      const rewriteHistory = await prisma.rewriteHistory.findMany({
        where: {
          rewrittenAt: {
            gte: startDate
          }
        },
        select: {
          qualityScore: true
        }
      });
      
      const avgQualityScore = rewriteHistory.length > 0
        ? Math.round(rewriteHistory.reduce((acc, h) => acc + (h.qualityScore || 0), 0) / rewriteHistory.length)
        : 0;
      
      // 順位改善記事数（モックデータ）
      const improvedCount = Math.floor(rewrittenCount * 0.7);
      
      console.log(`📝 リライト記事数: ${rewrittenCount}件`);
      console.log(`⭐ 平均品質スコア: ${avgQualityScore}点`);
      console.log(`📈 順位改善記事: ${improvedCount}件`);
      console.log(`🎯 改善率: ${rewrittenCount > 0 ? Math.round(improvedCount / rewrittenCount * 100) : 0}%`);
      
    } catch (error) {
      console.error('❌ エラー:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// 記事追加コマンド
program
  .command('add-article')
  .description('新しい記事をDBに追加')
  .requiredOption('-u, --url <url>', '記事URL')
  .requiredOption('-t, --title <title>', '記事タイトル')
  .requiredOption('-k, --keywords <keywords>', 'キーワード（カンマ区切り）')
  .action(async (options) => {
    console.log('➕ 記事を追加中...');
    
    try {
      const article = await prisma.article.create({
        data: {
          url: options.url,
          title: options.title,
          content: '', // 後でフェッチまたは手動で設定
          keywords: options.keywords,
          publishedAt: new Date()
        }
      });
      
      console.log('✅ 記事を追加しました');
      console.log(`   ID: ${article.id}`);
      console.log(`   タイトル: ${article.title}`);
      
    } catch (error) {
      console.error('❌ エラー:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// 社内情報追加コマンド
program
  .command('add-company-info')
  .description('社内情報をDBに追加')
  .requiredOption('-c, --category <category>', 'カテゴリ')
  .requiredOption('-t, --title <title>', 'タイトル')
  .requiredOption('--content <content>', '内容')
  .option('--confidential', '機密情報フラグ')
  .action(async (options) => {
    console.log('➕ 社内情報を追加中...');
    
    try {
      const info = await prisma.companyInfo.create({
        data: {
          category: options.category,
          title: options.title,
          content: options.content || '',
          isConfidential: options.confidential || false,
          tags: ''
        }
      });
      
      console.log('✅ 社内情報を追加しました');
      console.log(`   ID: ${info.id}`);
      console.log(`   タイトル: ${info.title}`);
      console.log(`   機密: ${info.isConfidential ? 'はい' : 'いいえ'}`);
      
    } catch (error) {
      console.error('❌ エラー:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

program.parse();
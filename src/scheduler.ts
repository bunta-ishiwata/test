import cron from 'node-cron';
import { RewriteAgent } from './agents/RewriteAgent.js';
import * as dotenv from 'dotenv';

dotenv.config();

// リライトエージェントのインスタンス
let agent: RewriteAgent | null = null;

// 毎日午前3時に実行
cron.schedule('0 3 * * *', async () => {
  console.log('🚀 [定期実行] リライトエージェント開始');
  
  try {
    agent = new RewriteAgent();
    await agent.processAllArticles();
  } catch (error) {
    console.error('❌ リライトエージェント実行エラー:', error);
  } finally {
    if (agent) {
      await agent.cleanup();
      agent = null;
    }
  }
});

// 手動実行用の関数をエクスポート
export async function runRewriteAgent(): Promise<void> {
  console.log('🚀 [手動実行] リライトエージェント開始');
  
  try {
    agent = new RewriteAgent();
    await agent.processAllArticles();
  } catch (error) {
    console.error('❌ リライトエージェント実行エラー:', error);
    throw error;
  } finally {
    if (agent) {
      await agent.cleanup();
      agent = null;
    }
  }
}

// プロセス終了時のクリーンアップ
process.on('SIGINT', async () => {
  console.log('\n⏹️ スケジューラー停止中...');
  if (agent) {
    await agent.cleanup();
  }
  process.exit(0);
});

console.log('⏰ スケジューラー起動完了');
console.log('  - リライトエージェント: 毎日午前3時に実行');
console.log('  - 手動実行: runRewriteAgent() を呼び出し');
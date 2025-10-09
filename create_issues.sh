#!/bin/bash

# GitHub CLIがインストールされていない場合はcURLで作成
REPO="bunta-ishiwata/test"
TOKEN="${GITHUB_TOKEN}"

if [ -z "$TOKEN" ]; then
  echo "❌ GITHUB_TOKENが設定されていません"
  echo "export GITHUB_TOKEN=your_token を実行してください"
  exit 1
fi

echo "📝 GitHub Issueを作成中..."

# Issue 1: リライトエージェント実行
curl -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/$REPO/issues \
  -d '{
    "title": "🔄 記事リライト: SEO対策記事の改善",
    "body": "## タスク\nSEO関連記事のリライトを実行\n\n## 対象\n- 90日以上更新されていない記事\n- 順位が4-20位の記事\n\n## 期待結果\n- FAQ追加\n- 内部リンク最適化\n- 品質スコア80点以上",
    "labels": ["agent:rewrite", "type:feature", "priority:P1-High"]
  }'

# Issue 2: ダッシュボード機能追加
curl -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/$REPO/issues \
  -d '{
    "title": "📊 ダッシュボード: リアルタイム分析機能",
    "body": "## 要件\n記事パフォーマンスのリアルタイム可視化\n\n## 機能\n- 日次/週次/月次レポート\n- 順位変動グラフ\n- CV分析",
    "labels": ["type:feature", "agent:codegen", "complexity:medium"]
  }'

# Issue 3: 自動テスト追加
curl -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/$REPO/issues \
  -d '{
    "title": "🧪 テスト: リライトエージェントのユニットテスト",
    "body": "## タスク\nリライトエージェントの自動テスト作成\n\n## カバレッジ目標\n80%以上",
    "labels": ["type:test", "agent:test", "priority:P2-Medium"]
  }'

# Issue 4: セキュリティ監査
curl -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/$REPO/issues \
  -d '{
    "title": "🔒 セキュリティ: APIキーの管理改善",
    "body": "## 課題\nAPIキーがハードコードされている可能性\n\n## 対策\n- 環境変数の適切な管理\n- シークレット管理の実装",
    "labels": ["type:security", "agent:review", "priority:P0-Critical"]
  }'

# Issue 5: パフォーマンス最適化
curl -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/$REPO/issues \
  -d '{
    "title": "⚡ 最適化: バッチ処理の並列化",
    "body": "## 現状\n記事を順次処理（遅い）\n\n## 改善案\n- 並列処理の実装\n- キュー管理の最適化",
    "labels": ["type:refactor", "agent:coordinator", "complexity:large"]
  }'

echo "✅ 5個のIssueを作成しました！"
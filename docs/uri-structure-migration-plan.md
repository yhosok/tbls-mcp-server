# URI Structure Migration Plan

## Overview

このドキュメントでは、tbls MCP ServerのリソースURI構造を改善するための移行計画を記載します。

## 現在のURI構造

```
schema://list                                    # 全スキーマ一覧
schema://{schemaName}/tables                     # スキーマ内のテーブル一覧
table://{schemaName}/{tableName}                 # テーブル詳細
table://{schemaName}/{tableName}/indexes         # テーブルインデックス
schema://uri-patterns                            # URIパターンドキュメント
```

## 新しいURI構造

```
db://schemas                                      # 全スキーマ一覧
db://schemas/{schemaName}/tables                  # スキーマ内のテーブル一覧
db://schemas/{schemaName}/tables/{tableName}      # テーブル詳細
db://schemas/{schemaName}/tables/{tableName}/indexes  # テーブルインデックス
```

## 変更の理由

### 1. 単一プロトコルプレフィックス
- `schema://`と`table://`の混在による混乱を解消
- `db://`に統一することで認知負荷を軽減

### 2. 階層構造の明確化
- RESTライクな階層構造を採用
- `schemas` → `{schemaName}` → `tables` → `{tableName}` → `indexes`
- データベース構造の論理的な関係を明示

### 3. LLMの理解向上
- 一貫したパターンでURI構築エラーを削減
- 階層構造により関係性が明示的
- 一般的なREST APIパターンに準拠

### 4. 発見可能性の向上
- 各レベルが自然に次のレベルに導く構造

## 実装計画

### 1. コアURIパターン更新
**対象ファイル**: `src/server/resource-patterns.ts`
- 全URIパターンを`schema://`と`table://`から`db://`階層に変更
- 新しい正規表現パターンでパターンマッチャー更新
- 静的および発見パターン定義の修正

### 2. リソースハンドラー更新
**対象ファイル**: `src/resources/`
- `schema-resource.ts`: `db://schemas`の処理
- `table-resource.ts`: 新階層パスの更新
- `index-resource.ts`: 新インデックスパスの更新
- `uri-patterns-resource.ts`: 新構造対応の更新/削除

### 3. スキーマとタイプ更新
**対象ファイル**: `src/schemas/database.ts`
- URI検証スキーマの修正
- 新パターンのタイプ定義更新

### 4. サーバー更新
**対象ファイル**: `src/server.ts`
- リソース登録の修正
- リソースアクセスハンドラーの更新
- 新パターンでの遅延ローディング確保

### 5. エラーハンドリング・サジェスト機能
**対象ファイル**: `src/server/uri-pattern-suggester.ts`
- 新URIパターンのサジェスト追加
- 新構造での類似性マッチング更新
- エラーメッセージの新パターン反映

### 6. テスト更新
**対象ファイル**: `tests/**/*.test.ts`
- 全テストファイルで新URIパターン使用
- カバレッジ確保項目:
  - パターンマッチング
  - リソース発見
  - ヘルプサジェスト付きエラーハンドリング
  - 新構造での遅延ローディング

### 7. ドキュメント更新
**対象ファイル**: `README.md`, `CLAUDE.md`
- 新URIパターンテーブル
- 全サンプルの更新
- 自動生成ドキュメントセクションの再生成

## 実装順序

1. **Phase 1**: パターン定義更新 (resource-patterns.ts)
2. **Phase 2**: リソースハンドラー更新
3. **Phase 3**: スキーマとサーバー更新
4. **Phase 4**: エラーハンドリング更新
5. **Phase 5**: テスト全体更新
6. **Phase 6**: ドキュメント更新

## 期待される効果

- **単一プロトコルプレフィックス**による認知負荷軽減
- **RESTful階層**による関係性の明確化
- **LLM互換性向上**による一貫したパターン
- **後方互換性の懸念なし**（本番未使用のため）

## 注意事項

- 現在本番利用者がいないため、後方互換性は考慮しない
- 全テストの通過を確認
- Lintチェックの通過を確認
- TDDサイクル（Red-Green-Refactor）で実装

## 完了基準

- [ ] 全URIパターンが新構造に更新済み
- [ ] 全テストが新パターンで通過
- [ ] Lintエラーなし
- [ ] ドキュメントが最新状態に更新済み
- [ ] エラーメッセージとサジェスト機能が新構造対応済み
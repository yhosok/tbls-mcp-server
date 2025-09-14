# 実装プラン: tbls MCP サーバー

## 📋 プロジェクト概要
tblsで生成されたDBスキーマ情報を参照し、SQLを実行できるMCPサーバーを実装します。

## 🎯 目標
- tblsによって出力されたスキーマ情報の格納フォルダを指定できるMCPサーバー
- DBスキーマ情報をMCPリソースとして提供
- オプションでDBへのSELECTクエリ実行機能を提供
- 関数型プログラミング、neverthrow、zodを活用した堅牢な実装

## 🏗️ プロジェクト構造
```
tbls-mcp-server/
├── src/
│   ├── index.ts                 # MCPサーバーエントリーポイント
│   ├── server.ts                # MCPサーバー実装
│   ├── parsers/
│   │   └── markdown-parser.ts    # tbls markdown パーサー
│   ├── resources/
│   │   ├── schema-resource.ts    # スキーマリソース
│   │   ├── table-resource.ts     # テーブルリソース
│   │   └── index-resource.ts     # インデックスリソース
│   ├── tools/
│   │   └── sql-query-tool.ts     # SQLクエリツール
│   ├── database/
│   │   ├── connection.ts         # DB接続管理
│   │   ├── mysql-adapter.ts      # MySQL接続
│   │   └── sqlite-adapter.ts     # SQLite接続
│   ├── schemas/
│   │   ├── config.ts             # 設定スキーマ（zod）
│   │   ├── database.ts           # DBスキーマ定義
│   │   └── validation.ts         # バリデーション
│   └── utils/
│       └── result.ts             # neverthrow ユーティリティ
├── tests/
│   ├── parsers/
│   ├── resources/
│   ├── tools/
│   └── database/
├── .github/
│   └── workflows/
│       └── ci.yml                # CI/CDワークフロー
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## 🔧 技術スタック
- **TypeScript**: 型安全な実装
- **@modelcontextprotocol/sdk**: MCPサーバー実装
- **neverthrow**: Result型によるエラーハンドリング
- **zod**: スキーマ定義とバリデーション
- **mysql2**: MySQL接続
- **sqlite3**: SQLite接続
- **jest**: テストフレームワーク
- **GitHub Actions**: CI/CD

## 📝 MCPリソース仕様

### サポートするリソース
1. **スキーマ一覧**: `schema://list`
   - 利用可能なすべてのスキーマを一覧表示

2. **テーブル一覧**: `schema://{schema_name}/tables`
   - 指定されたスキーマ内のテーブル一覧を表示

3. **テーブル詳細**: `table://{schema_name}/{table_name}`
   - 指定されたテーブルの詳細情報（カラム、型、コメント等）

4. **インデックス情報**: `table://{schema_name}/{table_name}/indexes`
   - 指定されたテーブルのインデックス情報

### MCPツール仕様
1. **SQLクエリ実行**: `execute-sql`
   - SELECT文のみ実行可能
   - MySQL/SQLite対応
   - 接続文字列による動的接続

## 📋 実装ステップ

### Phase 1: プロジェクト基盤
1. **プロジェクト初期化**
   - package.json作成（npxサポート設定含む）
   - TypeScript設定
   - 必要な依存関係のインストール
   - Jest設定

2. **基本構造作成**
   - ディレクトリ構造の作成
   - 基本的な設定ファイル

### Phase 2: コア機能実装
3. **スキーマ定義（zod）**
   - 設定スキーマ（DBフォルダパス、接続文字列）
   - DBスキーマ（テーブル、カラム、インデックス）
   - リクエスト/レスポンススキーマ

4. **Markdownパーサー実装**
   - tbls形式のmarkdownファイル解析
   - Resultタイプでエラーハンドリング
   - スキーマ情報の構造化

5. **MCPリソース実装**
   - スキーマ一覧リソース
   - テーブル一覧リソース
   - テーブル詳細リソース
   - インデックス情報リソース

### Phase 3: オプション機能
6. **SQLクエリツール実装**
   - SELECT文のみに制限するバリデーション
   - MySQL/SQLite接続アダプター
   - エラーハンドリング（neverthrow）

7. **データベース接続**
   - MySQL接続アダプター
   - SQLite接続アダプター
   - 接続プーリング

### Phase 4: 品質保証
8. **テスト実装（TDD）**
   - 各モジュールのユニットテスト
   - 統合テスト
   - Red-Green-Refactorサイクル

9. **CI/CD設定**
   - GitHub Actions ワークフロー
   - ビルドとテストの自動実行
   - リリース自動化

### Phase 5: 配布設定
10. **npx実行設定**
    - package.json の bin フィールド設定
    - 実行可能スクリプトの作成
    - GitHub リポジトリからの直接実行

## 🎯 実装方針

### アーキテクチャ原則
- **関数型プログラミング**: クラスを使わず、純粋関数で実装
- **エラーハンドリング**: neverthrowのResult型で統一
- **型安全性**: zodスキーマで入出力を厳密に定義
- **テスト駆動開発**: 各機能を実装前にテストを書く

### コード品質
- **最新技術の活用**: context7で最新のMCP実装パターンを確認
- **厳格なLinting**: ESLint + Prettier設定
- **型チェック**: TypeScript strict モード
- **コードカバレッジ**: 80%以上を目標

### セキュリティ
- **SQLインジェクション対策**: パラメータ化クエリ必須
- **SELECT文制限**: DDL/DMLを厳格に拒否
- **入力値検証**: zod による厳密なバリデーション

## 📅 マイルストーン

### Milestone 1: 基本MCP機能 (Week 1)
- プロジェクト初期化
- Markdownパーサー
- スキーマリソース実装

### Milestone 2: 完全リソース対応 (Week 2)
- 全リソースタイプ実装
- テストカバレッジ80%達成

### Milestone 3: SQL機能追加 (Week 3)
- SQLクエリツール実装
- DB接続アダプター

### Milestone 4: 製品化 (Week 4)
- CI/CD設定
- npx配布設定
- ドキュメント整備

## 🔍 品質チェックリスト
- [ ] すべてのテストが通過
- [ ] Lintエラーなし
- [ ] TypeScript型チェック通過
- [ ] コードカバレッジ80%以上
- [ ] セキュリティ脆弱性なし
- [ ] ドキュメント完備
- [ ] npx実行可能

この実装プランに従って、段階的にtbls MCP サーバーを構築していきます。
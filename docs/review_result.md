## コードレビュー総評

堅牢な型定義 (zod + neverthrow)、MCPリソース設計、SQL実行の安全対策が全体としてよく整理されており、拡張性も高い構成。特に:
- リソース URI 設計 (schema://, table://) が一貫
- neverthrow + zod によるバリデーション境界が明確
- DB 抽象 (MySQL / SQLite) が疎結合で移植性あり
- SELECT 専用クエリエンジンとタイムアウト、複文禁止などの防御が適切

一方で、重複検証/責務の分散、エラーメッセージ一貫性、潜在的パフォーマンス/運用面での改善余地がある。

---

## アーキテクチャ

良い点:
- server.ts は MCP ハンドラ集約に専念し副作用を局所化。
- パーサ層 (markdown/json) と schema-adapter 層の役割分離方針は妥当。
- DB 接続: プール + 汎用 `executeQuery` で単一経路を確保。

改善提案:
1. リソース動的発見: `ListResourcesRequest` 内で全スキーマ・全テーブルを逐次読み込み => 大規模環境で遅延/ブロッキング懸念。
  - 提案: 初回キャッシュ + TTL / on-demand 読み込み + lazy expansion (e.g. ページングや prefix filter)。
2. ログ機構: 現状 console 直書き。
  - 提案: 抽象化 (interface Logger) + レベルフィルタ + 構造化(JSON) 出力オプション。
3. エラードメイン統一: 例外 vs McpError vs neverthrow Error 混在。
  - 提案: カテゴリ (VALIDATION / IO / PARSE / DB / INTERNAL) をコード化。
4. パーサ共通部: JSON/Markdown のテーブル結合ロジック重複 (combineXxxResults)。共通ユーティリティ化可能。

---

## 型安全性 / エラーハンドリング

良い点:
- zod による明示スキーマ + neverthrow の境界設計。
- `validateSqlQueryRequest` → `sanitizeQuery` → `validateSqlQuery` の段階的検証。

改善提案:
1. `validateSqlQuery` が database.ts と validation.ts で概念重複 (SELECT限定). 片方へ統合。
2. `parseJsonSchema` の早期 return パターンを combinator 化で簡潔化可能。
3. `err(new Error(...))` 乱立 -> カスタム Error 型 (ParseError, DbError) でハンドリング改善。
4. `neverthrow` エラー文字列型 (string) 戻す場所と Error インスタンス混在。統一。

---

## パフォーマンス / リソース使用

良い点:
- MySQL はプール + シンプル検証クエリ。
- SQLite は busy 対策 (WAL, busy_timeout 用ヘルパ) 用意。

改善提案:
1. `ListResourcesRequest` で全ファイルパース (N * T). 大規模スキーマで O(n) 読み込みコスト。
  - キャッシュ + ファイル更新時のみ再パース (mtime 参照)。
2. `parseMarkdownContent` で正規表現/文字列分割多用 → 大ファイルで GC 負荷。
  - Streaming / 行走査 1 パス化検討。
3. タイムアウト処理: MySQL 側は Promise.race, SQLite 側も同様。
  - キャンセル (AbortController) 未対応 → 長時間I/O阻害リスク (許容範囲なら注記)。
4. JSON/Markdown パース結果を resource-level メモ化し同一 URI 再取得を高速化。

---

## セキュリティ

良い点:
- SELECT / SHOW / PRAGMA 等ホワイトリスト。
- 複数ステートメント阻止。
- `multipleStatements: false` (mysql2)。
- パラメータバインド経路を利用。

改善提案:
1. クエリ種別判定: コメント除去後に lower-case 先頭トークンのみ (現在でも可)。ただし CTE (`WITH x AS (...) SELECT`) が許容されない可能性 → 明示要件判断。必要なら `with` を許容して末尾 SELECT 検証。
2. SQLite: ファイルパス検証 (存在/権限) 追加検討 (現状 path チェックは config validation 依存)。
3. エラーメッセージ: DB内部構造 (Unknown column ...) をそのまま伝播。ユーザー可視層向けにラップし内部詳細を log-only 化。
4. ログにクエリパラメータを生のまま出さない (PII 懸念) → マスク設定追加。

---

## テストカバレッジ / 品質

良い点:
- パーサ正常・異常系網羅 (空, 複数 statements, コメント, リレーション)。
- DB アダプタはモックベース/ 正常系 + エラー検証有り。
- TDD痕跡 (REDフェーズコメント) が保守性の意図明確。

改善提案:
1. プール再利用シナリオ (同一 config で getConnection 2回が同一インスタンス) を追加。
2. タイムアウト動作 (意図的 delay で timeout エラー) のテスト。
3. SQLite busy リトライ (locked) 分岐をユニットテスト化。
4. Markdown パーサ: 不完全行 (欠損カラム/インデックス行) スキップの挙動 → 明示テスト。
5. CTE / EXPLAIN / DESC など許容クエリ境界テスト (仕様明文化)。

---

## ドキュメント / DX

良い点:
- README は導入、MCP統合、URI/Tool 仕様が明確。
- セキュリティ制約を列挙し利用者期待値を調整。

改善提案:
1. 大規模スキーマでのパフォーマンス注意喚起と推奨運用 (キャッシュ, 監視)。
2. リソース URI 一覧の生成ロジック (遅延 vs 事前) 説明。
3. エラーパターン チートシート (config validation / parse failure / DB 接続 / timeout)。
4. バージョン方針 (Semantic Versioning / 破壊的変更指針)。
5. ロギングオプション (将来: JSON, quiet) セクションのプレースホルダ。

---

## 改善提案 (優先度別)

高:
1. `ListResourcesRequest` の全面パース抑制 (キャッシュ / lazy discovery)。
2. `validateSqlQuery` 重複定義統合 & CTE対応検討。
3. エラードメイン/型標準化 (DomainErrorクラス群 + エラーコード列挙)。
4. セキュアログ方針 (PIIマスク, query parameter redaction オプション)。

中:
5. パース結果メモ化 + mtime 監視。
6. ロガー抽象 (pluggable logger)。
7. SQLite busy リトライ・設定を config 経由で有効化。
8. クエリメタデータ (`executeSafeQuery`) を MCP tool 出力にオプションで含められる仕組み (フラグ)。

低:
9. Markdown / JSON パーサの共通化ユーティリティ (combineXXXResults の統合)。
10. ConnectionPool に最大アイドル時間/明示 closeAll フック (graceful shutdown) を READMEに記述。
11. Type narrowing 補助 (exhaustiveness check) のユーティリティ化。
12. CLI: `--database-test` オプションで起動前検証 → 失敗時早期終了。

---

## 具体的な次のステップ（非コード変更）

1. 設計ドキュメント追加: resource discovery フロー図 + キャッシュ戦略案。
2. エラー分類表 (コード, HTTP/MCP対応, ユーザー露出可否)。
3. パフォーマンス検証: 1K/5K テーブルのパース時間計測 (現状ベースライン計測)。
4. CTE / EXPLAIN / DESC の受容要否を要件として確定。
5. ロガー/メトリクス (duration, rowCount) を structured JSON option で提供する仕様ドラフト。

---

## 指摘のサマリ（簡潔）

- 設計: 全体整合性は高いがリソース動的発見のスケール特性最適化余地あり
- 型/エラー: 重複検証関数とエラー表現の統一余地
- パフォーマンス: パース結果キャッシュと I/O 削減が今後必要
- セキュリティ: 詳細エラーメッセージ露出制御 / CTE対応検討
- テスト: プール再利用、timeout、busyリトライ等の追加ケース
- ドキュメント: 運用/性能/エラー分類を補強

---

何か特定の領域を深掘りしたい場合（例: キャッシュ設計案・エラーコード体系など）を指定してください。
# Repository Guidelines

このドキュメントおよび今後の更新は必ず日本語で記載してください。変更は小さく、十分にテストし、下記の方針に合わせてください。

-## プロジェクト固有メモ
- 設計/要件: `docs/snowjam-detection-system.md`（v0.9）。遅延監視はデフォルト5分Warning、UIで閾値とON/OFFを変更可。誤検知20%まで許容、漏れゼロ目標。Slack通知と任意GPIO High出力でブザー駆動。マスクはモノクロ画像（PNG/JPEG）をアップロードし、ON時は白領域のみ検出、OFF時は全域検出。
- 技術方針: `docs/tech-stack.md`（v0.9）。FastAPI + OpenCV + APScheduler + watchdog/ポーリング、React。設定は `config/settings.json`、マスクは `config/mask.png`。オーバーレイ色と不透明度は設定で変更可。
- ロードマップ: `docs/roadmap.md`（v0.9）。Compose構築→リテンション→検知→アラート(Slack/GPIO/遅延監視)→API→フロント→テスト。作業をしたら必ず roadmap を最新化する。
- 参考画像: `SamplePhoto/` に定点カメラ画像（スノージャムなし）がある。キャリブレーションや誤検知チェックに使用。
- 進行ルール: 作業を行ったら必ず `docs/roadmap.md` のステータスとステップを更新し、過不足があればタスクを追加・最適化する。インポート/エクスポート・UI改修なども反映する。

## プロジェクト構成とモジュール配置
- アプリケーションコードは `src/`、共有ヘルパーは `src/lib/`、UI は `src/components/` にまとめる。
- 静的アセットは `public/`、環境設定やビルド設定はリポジトリ直下に配置する。
- テストはコードの配置を鏡像にし、例: `src/components/Button.tsx` に対して `tests/components/Button.test.tsx`。
- 開発用スクリプトは `scripts/` に置き、先頭コメントで用途と使い方を簡潔に説明する。

## ビルド・テスト・開発コマンド
- 依存関係はロックファイルに合わせたパッケージマネージャーでインストール（特に指定がなければ `npm install`）。
- ローカル起動は `npm run dev`、本番ビルドは `npm run build`、ビルド済みのサーブは必要に応じて `npm run start`。
- テストは `npm test`、対話的に回す場合は `npm run test:watch` があれば利用する。
- PR 前に `npm run lint` と `npm run format` を実行し、プロジェクトの ESLint/Prettier 設定に合わせて整形する。

## コーディングスタイルと命名
- 既存の lint/format 設定に従い、デフォルトは 2 スペースインデント、シングルクォート、末尾カンマを採用。新規は TypeScript を優先。
- コンポーネント/クラスは PascalCase、関数や変数は camelCase、コンポーネント以外のファイル名は kebab-case（フレームワークで指定がある場合は従う）。
- 意図が伝わりにくい箇所のみコメントを追加し、命名で可読性を確保する。

## テスト指針
- 挙動変更ごとにテストを追加・更新し、素早いユニットテストを優先しつつ重要経路には統合テストも追加する。
- テストファイルは `*.test.ts`/`*.test.tsx` とし、コードの近くか `tests/` の鏡像パスに配置する。
- 成功・失敗・境界ケースをカバーし、分岐変更時のリグレッションを防ぐ。

## コミットと Pull Request ガイドライン
- コミットメッセージは Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:` など) でスコープを簡潔に示す。
- コミットは小さく焦点を絞り、リファクタと機能変更は原則分ける。
- PR には概要、実行したテスト/コマンド、関連 Issue、UI 変更がある場合はスクリーンショットを含める。
- 大規模化しそうな場合は早めにドラフト/レビューを依頼し、複数の小さな PR に分割する。

## セキュリティと設定の注意
- 秘密情報はコミットしない。`.env.local` など gitignore 対象の環境ファイルを使い、必要なキーは PR 説明に明記する。
- 万が一トークンが漏れた場合は即時ローテートし、PR に対応策を記載する。
- Slack Webhook URL や GPIO ピン設定は `config/settings.json` または環境変数で扱い、リポジトリに含めない。

# スノージャム検知システム セットアップ手順

## 前提
- Node.js/npm が利用可能であること（依存はロックファイルに合わせて `npm install`）。
- Slack通知を行う場合は Bot Token（画像添付用）または Incoming Webhook URL を準備。
- GPIOは物理ピン11（GPIO17）をデフォルトで使用（設定で変更可）。未設定なら無効。

## セットアップ
### Docker Composeでの起動（推奨）
1. 設定ファイルの確認 (`config/settings.json`)  
   例:
   ```json
   {
     "threshold": 0.15,
     "consecutive_hits": 3,
     "binary_threshold": 30,
     "blur_kernel": 3,
     "delay_monitor_enabled": true,
     "delay_threshold_seconds": 300,
     "alarm_enabled": true,
     "slack_webhook_url": "",
     "slack_bot_token": "",
     "slack_channel": "",
     "gpio_pin": 17
   }
   ```
2. マスクファイルの初期化 (`config/mask.json`)  
   フロント設定画面からモノクロのPNG/JPEGマスクをアップロードする。白=適用、黒=非適用（除外モードでは反転）。
3. Docker Compose起動  
   `docker compose up --build`  
   （フロントエンドのnpm install/ビルドはコンテナ内で自動実行される）
4. ログ/保存用ディレクトリの作成（必要に応じて）  
   `/ftp_data/incoming`, `/storage/archive`, `/logs` を作成し、書き込み権限を確認。

### ローカル開発（フロントエンドのみ）
1. 依存インストール  
   `cd frontend && npm install`
2. 開発サーバー  
   `npm run dev`
3. ビルド  
   `npm run build`

## Docker Compose（フェーズ1基盤）
- 主要サービス: backend(FastAPI), nginx(フロント静的配信+リバースプロキシ), ftp(画像受信)。
- 立ち上げ: `docker compose up --build`（フロントエンドをコンテナ内でビルド）
- ボリューム: `./config` `/storage` `/logs` `/ftp_data` をマウント。必要に応じて権限を調整。`/storage` はNginxにもマウントし `/storage/...` で画像/オーバーレイを配信。
- FTP デフォルトユーザー: `ftpuser` / `ftpuser`（ `docker-compose.yml` で変更可）。
- 複数ユーザーが同一ホストでクローンする場合は `./scripts/compose-up.sh` を利用すると、ユーザー名を含んだプロジェクト名で起動し他ユーザーのコンテナ・ボリュームと分離できる。

## 開発・起動
 - フロント/開発サーバー: `npm run dev`（`frontend/` ディレクトリ）
 - ビルド: `npm run build`
- テスト: `npm test`（対話式は `npm run test:watch` があれば利用）
- Docker Compose を使う場合は `docker compose up`（構成は `docs/roadmap.md` を参照して追加）

## 環境変数の例
- `SLACK_BOT_TOKEN`: Slack Web API用（画像添付で利用）。未設定ならWebhookテキスト通知のみ。
- `SLACK_WEBHOOK_URL`: Slack通知のWebhook。未設定なら通知無効。
- その他の秘密情報は `.env.local` など gitignore 対象に置く。

## 参考ドキュメント
- 要件・設計: `docs/snowjam-detection-system.md`
- 技術スタック: `docs/tech-stack.md`
- ロードマップ: `docs/roadmap.md`
- 開発ガイド: `AGENTS.md`

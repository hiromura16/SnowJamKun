# スノージャム検知システム 技術スタック・実装ルール (v0.9)

## 1. 技術スタック
- **Backend**: FastAPI, APScheduler（定期タスク）, Pydantic（設定バリデーション）, OpenCV（画像差分・マスク処理）, watchdog（イベント監視） + ポーリングの二重化。
- **Frontend**: React, React Router。マスクはモノクロPNG/JPEGアップロード方式（ON: 白領域のみ検出、OFF: 全域検出）。
- **Storage**: ローカルファイルシステム（`/storage/archive/YYYY/MM/DD/`）。
- **通知/I/O**: GPIO制御（任意ピンHigh）、Slack通知（最新画像添付: Web API/`files.upload`、Webhookのみの場合はテキスト+URL）。

## 2. ディレクトリ・ファイル構造
/snowjam_system
  ├── /ftp_data
  │    └── /incoming           # カメラからのアップロード場所（監視対象）
  ├── /storage
  │    └── /archive/YYYY/MM/DD # 保存先（90日保持）
  ├── /config
  │    ├── settings.json       # しきい値、連続回数、二値化閾値、ぼかし、遅延閾値ON/OFF、Slack Webhook/Bot Token、GPIOピン、オーバーレイ色/不透明度、マスク適用フラグ
  │    └── mask.png            # モノクロマスク（白=適用）。マスクOFF時は全域検出。
  ├── /logs                    # 発報・削除・遅延記録
  └── ...

## 3. バックエンド実装ルール
- **画像処理フロー**:
  1. `/incoming` に画像到着（watchdog/ポーリング）。
  2. 前回画像と差分比較し、マスク適用→差分→二値化→ノイズ除去→面積判定。
  3. 判定結果を設定状態に反映。警報が必要ならGPIO HighとSlack通知を発火（画像添付は Bot Token + `files.upload`、Webhookのみの場合はテキスト通知にフォールバック）。
  4. 画像を `/storage/archive/YYYY/MM/DD/` へ移動し、オーバーレイPNGを生成。
  5. APSchedulerで毎日03:00に90日超を削除（件数ログ）。
- **遅延監視**:
  - 到着間隔が設定値（デフォルト5分）を超えたらWarningを記録しUIへ反映。閾値と有効/無効は設定で変更。watchdogの取りこぼしに備え、10秒ポーリングを併用。
- **API設計**:
  - `GET /api/dashboard`: 最新/前回画像パス、検知値、警報状態、遅延状態、オーバーレイPNGパス。
  - `GET /api/history`: 直近N件の画像リスト（デフォルトでオーバーレイ除外）。
  - `POST /api/config`: 検知パラメータ、遅延監視ON/OFF、Slack、GPIOピン、マスク適用ON/OFF、オーバーレイ色・不透明度を保存。
  - `POST /api/control`: 警報ON/OFF、リセット（GPIO解除）、遅延監視ON/OFF。
  - `GET/POST/DELETE /api/mask-image`: モノクロマスクの取得/適用/リセット。
- **ヘルスチェック**:
  - `GET /health`: プロセス正常性、ストレージ空き、遅延監視の状態を返す。

## 4. フロントエンド実装ルール
- **ルーティング**:
  - `/` : ダッシュボード（最新画像・オーバーレイ画像・1分前画像・履歴3枚、警報/遅延ステータス、操作ボタン）。
  - `/settings` : 設定（数値入力、Slack Webhook、GPIOピン、遅延監視ON/OFF・閾値、マスク適用ON/OFF、オーバーレイ色/不透明度、設定のインポート/エクスポート）。
- **マスク設定UI**:
  - モノクロPNG/JPEGをアップロードし、適用ON/OFFを切替。リセット、プレビューを提供。
- **操作/表示**:
  - 警報ON/OFF・リセット・遅延監視ON/OFFの切替。
  - 最新画像の素の表示とオーバーレイ表示を並列で提供。履歴サムネはクリックでライトボックス拡大。設定を変更するとオーバーレイがキャッシュバスター付きで即時反映。
  - 設定インポート/エクスポート（JSON）を提供。ダッシュボード・設定間で自動同期（編集中は上書き防止）。

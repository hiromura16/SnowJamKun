import { useEffect, useMemo, useState, useRef } from 'react'
import { Link, Routes, Route, useLocation } from 'react-router-dom'
import './App.css'

type Theme = 'dark' | 'light'

type DashboardResponse = {
  latest_image: string | null
  previous_image: string | null
  mask_overlay: string | null
  detection_rate: number
  threshold: number
  alarm_state: 'Normal' | 'Warning' | 'Alarm' | string
  delay_warning: boolean
  logs: string[]
  latest_timestamp?: string | null
  previous_timestamp?: string | null
}

type HistoryItem = { path: string; mtime: string | null; is_overlay: boolean }

type HistoryResponse = { images: HistoryItem[]; limit: number; exclude_overlay: boolean }
type ConfigResponse = {
  settings: {
    threshold: number
    consecutive_hits: number
    binary_threshold: number
    blur_kernel: number
    overlay_color: string
    overlay_alpha: number
    delay_monitor_enabled: boolean
    delay_threshold_seconds: number
    alarm_enabled: boolean
    slack_webhook_url: string
    slack_bot_token: string
    slack_channel: string
    mask_inclusive: boolean
    gpio_pin: number | null
  }
}

type MaskImageInfo = { url: string | null }

type ControlPayload = Partial<{
  alarm_enabled: boolean
  reset_alarm: boolean
  delay_monitor_enabled: boolean
}>

const api = {
  async getDashboard(): Promise<DashboardResponse> {
    const res = await fetch('/api/dashboard')
    if (!res.ok) throw new Error(`dashboard error: ${res.status}`)
    return res.json()
  },
  async getHistory(limit = 3): Promise<HistoryResponse> {
    const res = await fetch(`/api/history?limit=${limit}&exclude_overlay=true`)
    if (!res.ok) throw new Error(`history error: ${res.status}`)
    return res.json()
  },
  async getConfig(): Promise<ConfigResponse> {
    const res = await fetch('/api/config')
    if (!res.ok) throw new Error(`config error: ${res.status}`)
    return res.json()
  },
  async control(payload: ControlPayload): Promise<void> {
    await fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  async updateConfig(payload: Partial<ConfigResponse['settings']>): Promise<void> {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  async getMaskImage(): Promise<MaskImageInfo> {
    const res = await fetch('/api/mask-image')
    if (res.status === 404) return { url: null }
    if (!res.ok) throw new Error(`mask error: ${res.status}`)
    return { url: '/api/mask-image' }
  },
  async uploadMaskImage(file: File): Promise<void> {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/mask-image', { method: 'POST', body: fd })
    if (!res.ok) throw new Error(`mask upload error: ${res.status}`)
  },
  async resetMaskImage(): Promise<void> {
    await fetch('/api/mask-image', { method: 'DELETE' })
  },
}

function ImageWithOverlay({
  base,
  overlay,
  title,
  onClick,
  subtitle,
  filename,
}: {
  base: string | null
  overlay?: string | null
  title: string
  onClick?: () => void
  subtitle?: string | null
  filename?: string | null
}) {
  if (!base) {
    return (
      <div className="image-card empty">
        <span>{title}: 画像なし</span>
      </div>
    )
  }
  return (
    <div className="image-card" onClick={onClick} role="button" tabIndex={0}>
      <div className="image-wrapper">
        <img src={base} alt={title} />
        {overlay ? <img className="overlay" src={overlay} alt={`${title} overlay`} /> : null}
      </div>
      <div className="image-caption">
        {title}
        {subtitle ? <span className="muted small"> {subtitle}</span> : null}
        {filename ? <span className="filename">{filename}</span> : null}
      </div>
    </div>
  )
}

function App() {
  const location = useLocation()
  const isDashboard = location.pathname === '/' || location.pathname === ''
  const isSettings = location.pathname === '/settings'
  const [theme, setTheme] = useState<Theme>('dark')

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [config, setConfig] = useState<ConfigResponse['settings'] | null>(null)
  const [maskImageUrl, setMaskImageUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const importFileRef = useRef<HTMLInputElement | null>(null)
  const [toggleBusy, setToggleBusy] = useState(false)
  const [modalImage, setModalImage] = useState<{ base: string; overlay?: string; title: string } | null>(null)
  const [configDirty, setConfigDirty] = useState(false)
  const [alarmAcknowledged, setAlarmAcknowledged] = useState(false)

  const fetchAll = async (silent = false, forceConfig = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const [dashRaw, hist, cfg, maskImg] = await Promise.all([
        api.getDashboard(),
        api.getHistory(3),
        api.getConfig(),
        api.getMaskImage(),
      ])
      const cacheBuster = Date.now()
      const dash = {
        ...dashRaw,
        mask_overlay: dashRaw.mask_overlay ? `${dashRaw.mask_overlay}?v=${cacheBuster}` : null,
      }
      setDashboard(dash)
      setHistory(hist.images)
      if (!configDirty || forceConfig) {
        setConfig(cfg.settings)
        if (forceConfig) setConfigDirty(false)
      }
      setMaskImageUrl(maskImg.url ? `${maskImg.url}?v=${Date.now()}` : null)
      // Alarm ON かつ Alarm状態のときだけバナーを再表示する
      if (cfg.settings.alarm_enabled && dashRaw.alarm_state === 'Alarm') {
        setAlarmAcknowledged(false)
      } else {
        setAlarmAcknowledged(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const formatTimestamp = (ts?: string | null) => {
    if (!ts) return undefined
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ts
    return d.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const filenameFromPath = (p?: string | null) => {
    if (!p) return null
    const base = p.split('?')[0] ?? p
    const parts = base.split('/')
    return parts[parts.length - 1] || base
  }

  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved)
    }
    fetchAll()
    const id = setInterval(() => fetchAll(true), 10000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const sync = async () => {
      if (configDirty) return
      try {
        const cfg = await api.getConfig()
        setConfig(cfg.settings)
      } catch (e) {
        // ignore
      }
    }
    const id = setInterval(sync, 5000)
    return () => clearInterval(id)
  }, [configDirty])

  const onControl = async (payload: ControlPayload, label: string) => {
    try {
      setActionMessage(null)
      await api.control(payload)
      setActionMessage(`${label} を送信しました`)
    } catch (e) {
      setActionMessage(`失敗: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      fetchAll()
    }
  }

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
  }

  const statusColor = useMemo(() => {
    if (!dashboard) return 'badge neutral'
    const alarmActive = dashboard.alarm_state === 'Alarm' && (config?.alarm_enabled ?? true)
    if (alarmActive) return 'badge danger'
    if (dashboard.delay_warning || dashboard.alarm_state === 'Warning') return 'badge warning'
    return 'badge success'
  }, [dashboard, config])

  const toggleAlarm = async () => {
    if (!config || toggleBusy) return
    const next = !config.alarm_enabled
    setToggleBusy(true)
    // 楽観的更新
    setConfig((prev) => (prev ? { ...prev, alarm_enabled: next } : prev))
    try {
      await api.updateConfig({ alarm_enabled: next })
      const cfg = await api.getConfig()
      setConfig(cfg.settings)
      setActionMessage(`警報を${next ? 'ON' : 'OFF'}にしました`)
    } catch (e) {
      // rollback
      setConfig((prev) => (prev ? { ...prev, alarm_enabled: !next } : prev))
      setActionMessage(`警報切替失敗: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setToggleBusy(false)
      setConfigDirty(false)
      await fetchAll(true, true)
    }
  }

  const toggleDelay = async () => {
    if (!config || toggleBusy) return
    const next = !config.delay_monitor_enabled
    setToggleBusy(true)
    try {
      setConfig((prev) => (prev ? { ...prev, delay_monitor_enabled: next } : prev))
      await api.updateConfig({ delay_monitor_enabled: next })
      const cfg = await api.getConfig()
      setConfig(cfg.settings)
      setConfigDirty(false)
      await fetchAll(true, true)
      setActionMessage(`遅延監視を${next ? 'ON' : 'OFF'}にしました`)
    } catch (e) {
      setConfig((prev) => (prev ? { ...prev, delay_monitor_enabled: !next } : prev))
      setActionMessage(`遅延監視切替失敗: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setToggleBusy(false)
    }
  }

  const resetAlarm = async () => {
    await onControl({ reset_alarm: true }, '警報リセット')
    setAlarmAcknowledged(true)
    setDashboard((prev) => (prev ? { ...prev, alarm_state: 'Normal' } : prev))
  }

  const setNumberField = (key: keyof ConfigResponse['settings'], value: string) => {
    setConfigDirty(true)
    setConfig((prev) => {
      if (!prev) return prev
      if (value === '') return { ...prev, [key]: '' as any }
      const num = Number(value)
      if (Number.isNaN(num)) return prev
      return { ...prev, [key]: num }
    })
  }

  const cleanConfigForSave = (cfg: ConfigResponse['settings']) => {
    const cleaned: Record<string, unknown> = {}
    const numKeys: (keyof ConfigResponse['settings'])[] = [
      'threshold',
      'consecutive_hits',
      'binary_threshold',
      'blur_kernel',
      'overlay_alpha',
      'delay_threshold_seconds',
      'gpio_pin',
    ]
    numKeys.forEach((k) => {
      const v = cfg[k] as unknown
      if (typeof v === 'number' && !Number.isNaN(v)) cleaned[k] = v
    })
    cleaned.delay_monitor_enabled = cfg.delay_monitor_enabled
    cleaned.alarm_enabled = cfg.alarm_enabled
    cleaned.overlay_color = cfg.overlay_color
    cleaned.slack_webhook_url = cfg.slack_webhook_url ?? ''
    cleaned.slack_bot_token = cfg.slack_bot_token ?? ''
    cleaned.slack_channel = cfg.slack_channel ?? ''
    return cleaned
  }

  const Toggle = ({
    on,
    label,
    onClick,
    disabled,
  }: {
    on: boolean
    label: string
    onClick: () => void
    disabled?: boolean
  }) => (
    <button
      className={`toggle ${on ? 'on' : 'off'}`}
      onClick={onClick}
      type="button"
      aria-pressed={on}
      disabled={disabled}
    >
      <span className="thumb" />
      <span className="toggle-label">
        {label}：<strong>{on ? 'ON' : 'OFF'}</strong>
      </span>
    </button>
  )

  const saveConfig = async () => {
    if (!config) return
    try {
      await api.updateConfig(cleanConfigForSave(config))
      setActionMessage('設定を保存しました')
      await fetchAll(false, true)
    } catch (e) {
      setActionMessage(`設定保存失敗: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  const handleExportConfig = async () => {
    try {
      let cfg = config
      if (!cfg) {
        const res = await api.getConfig()
        cfg = res.settings
      }
      if (!cfg) return
      const blob = new Blob([JSON.stringify(cleanConfigForSave(cfg), null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'snowjam-settings.json'
      a.click()
      URL.revokeObjectURL(url)
      setActionMessage('設定をエクスポートしました')
    } catch (e) {
      setActionMessage(`エクスポート失敗: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  const handleImportConfig = async (file: File) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const allowedKeys: (keyof ConfigResponse['settings'])[] = [
        'threshold',
        'consecutive_hits',
        'binary_threshold',
        'blur_kernel',
        'overlay_color',
        'overlay_alpha',
        'delay_monitor_enabled',
        'delay_threshold_seconds',
        'alarm_enabled',
        'slack_webhook_url',
        'slack_bot_token',
        'slack_channel',
        'mask_inclusive',
        'gpio_pin',
      ]
      const payload: Record<string, unknown> = {}
      allowedKeys.forEach((k) => {
        if (k in data) payload[k] = data[k]
      })
      await api.updateConfig(payload)
      setActionMessage('設定をインポートして適用しました')
      setConfigDirty(false)
      await fetchAll(false, true)
    } catch (e) {
      setActionMessage(`インポート失敗: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      if (importFileRef.current) importFileRef.current.value = ''
    }
  }

  const uploadMask = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setActionMessage('マスク画像を選択してください')
      return
    }
    try {
      await api.uploadMaskImage(file)
      setMaskImageUrl(`/api/mask-image?v=${Date.now()}`)
      setActionMessage('マスク画像を適用しました')
    } catch (e) {
      setActionMessage(`マスク適用失敗: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      await fetchAll(true)
    }
  }

  const resetMask = async () => {
    const ok = window.confirm('マスク画像をリセットしてもよいですか？')
    if (!ok) return
    try {
      await api.resetMaskImage()
      setMaskImageUrl(null)
      setActionMessage('マスクをリセットしました')
    } catch (e) {
      setActionMessage(`マスクリセット失敗: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      await fetchAll(true)
    }
  }

  return (
    <div className="page">
      <header className="header">
        <div className="branding">
          <div className="logo-icon">
            <img src="/logo.png" alt="Snowjam logo" />
          </div>
        </div>
        <div className="header-actions">
          <Link className={`ghost ${isDashboard ? 'active' : ''}`} to="/">
            ダッシュボード
          </Link>
          <Link className={`ghost ${isSettings ? 'active' : ''}`} to="/settings">
            設定
          </Link>
          <button className="ghost" onClick={() => fetchAll()} disabled={loading}>
            最新状態を取得
          </button>
          <button className="ghost" onClick={toggleTheme}>
            テーマ: {theme === 'dark' ? 'ダーク' : 'ライト'}
          </button>
        </div>
      </header>

      {dashboard?.alarm_state === 'Alarm' && config?.alarm_enabled && !alarmAcknowledged ? (
        <div className="alarm-banner">
          <div className="alarm-banner__meta">
            <div className="label">警報発生中</div>
            <div className="alarm-banner__title">ALARM</div>
            <div className="alarm-banner__sub">
              検知値 {(dashboard.detection_rate * 100).toFixed(2)}% / しきい値 {(dashboard.threshold * 100).toFixed(2)}%
            </div>
          </div>
          <div className="alarm-banner__actions">
            <span className="alarm-dot" aria-hidden />
            <button className="alarm-reset" onClick={resetAlarm}>
              警報リセット
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div className="banner error">Error: {error}</div> : null}
      {actionMessage ? <div className="banner info">{actionMessage}</div> : null}

      <Routes>
        <Route
          path="/"
          element={
            <>
              <section className="grid stats">
                <div className="card">
                  <div className="label">警報状態</div>
                  <div className={statusColor}>{dashboard?.alarm_state ?? '—'}</div>
                  <div className="label sub">遅延: {dashboard?.delay_warning ? 'あり' : 'なし'}</div>
                </div>
                <div className="card">
                  <div className="label">検知値</div>
                  <div className="metric">{((dashboard?.detection_rate ?? 0) * 100).toFixed(2)}%</div>
                  <div className="label sub">しきい値: {(dashboard?.threshold ?? 0) * 100}%</div>
                </div>
                <div className="card controls">
                  <div className="label">操作</div>
                  <div className="control-buttons">
                    <Toggle on={config?.alarm_enabled ?? false} label="警報" onClick={toggleAlarm} />
                    <button
                      className={`reset ${dashboard?.alarm_state !== 'Alarm' ? 'disabled' : ''}`}
                      onClick={resetAlarm}
                      disabled={dashboard?.alarm_state !== 'Alarm'}
                    >
                      警報リセット
                    </button>
                  </div>
                </div>
              </section>

              <section className="grid images">
                <ImageWithOverlay
                  base={dashboard?.latest_image ?? null}
                  title="最新画像"
                  subtitle={formatTimestamp(dashboard?.latest_timestamp)}
                  filename={filenameFromPath(dashboard?.latest_image ?? null)}
                  onClick={
                    dashboard?.latest_image
                      ? () =>
                          setModalImage({
                            base: dashboard.latest_image!,
                            title: `最新画像 ${dashboard?.latest_timestamp ?? ''}`,
                          })
                      : undefined
                  }
                />
                <ImageWithOverlay
                  base={dashboard?.mask_overlay ?? null}
                  title="最新画像（オーバーレイ）"
                  subtitle="検知エリアを重ねた表示"
                  filename={filenameFromPath(dashboard?.mask_overlay ?? null)}
                  onClick={
                    dashboard?.mask_overlay
                      ? () =>
                          setModalImage({
                            base: dashboard.mask_overlay!,
                            title: `最新画像（オーバーレイ） ${formatTimestamp(dashboard?.latest_timestamp) ?? ''}`,
                          })
                      : undefined
                  }
                />
                <ImageWithOverlay
                  base={dashboard?.previous_image ?? null}
                  title="1分前画像"
                  subtitle={formatTimestamp(dashboard?.previous_timestamp)}
                  filename={filenameFromPath(dashboard?.previous_image ?? null)}
                  onClick={
                    dashboard?.previous_image
                      ? () =>
                          setModalImage({
                            base: dashboard.previous_image!,
                            title: `1分前画像 ${dashboard?.previous_timestamp ?? ''}`,
                          })
                      : undefined
                  }
                />
              </section>

              <section className="card history">
                <div className="label">履歴（最新から表示、オーバーレイ除外）</div>
                <div className="history-grid">
                  {history.length === 0 ? (
                    <div className="muted">履歴がありません</div>
                  ) : (
                    history.map((item) => (
                      <div
                        key={item.path}
                        className="history-item"
                        onClick={() =>
                          setModalImage({
                            base: item.path,
                            title: `${item.path.split('/').slice(-2).join('/')} ${formatTimestamp(item.mtime) ?? ''}`,
                          })
                        }
                        role="button"
                        tabIndex={0}
                      >
                        <img src={item.path} alt={item.path} />
                        <div className="history-meta">
                          <span className="path">{item.path.split('/').slice(-2).join('/')}</span>
                          <span className="time">{formatTimestamp(item.mtime) ?? '—'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          }
        />
        <Route
          path="/settings"
          element={
            <div className="grid settings">
              <div className="settings-columns">
                <div className="card">
                  <div className="label">検知パラメータ</div>
                  <div className="form-grid">
                    <label title="変化面積割合のしきい値(0-1)。超えると警報候補。">
                      しきい値
                      <input
                        type="number"
                        step="0.01"
                        value={config?.threshold ?? ''}
                        onChange={(e) => setNumberField('threshold', e.target.value)}
                      />
                    </label>
                    <label title="しきい値超えを何回連続で検知したら警報にするか。">
                      連続回数
                      <input
                        type="number"
                        value={config?.consecutive_hits ?? ''}
                        onChange={(e) => setNumberField('consecutive_hits', e.target.value)}
                      />
                    </label>
                    <label title="差分画像の二値化閾値。小さいほど微小変化を拾いやすい。">
                      二値化閾値
                      <input
                        type="number"
                        value={config?.binary_threshold ?? ''}
                        onChange={(e) => setNumberField('binary_threshold', e.target.value)}
                      />
                    </label>
                    <label title="Gaussian blurのカーネルサイズ（奇数）。大きいほどノイズに強い。">
                      ぼかしカーネル
                      <input
                        type="number"
                        value={config?.blur_kernel ?? ''}
                        onChange={(e) => setNumberField('blur_kernel', e.target.value)}
                      />
                    </label>
                    <label title="オーバーレイの色（検知ピクセルの塗り色）。">
                      オーバーレイ色
                      <input
                        type="color"
                        value={config?.overlay_color ?? '#ff69b4'}
                        onChange={(e) => {
                          setConfigDirty(true)
                          setConfig((prev) => (prev ? { ...prev, overlay_color: e.target.value } : prev))
                        }}
                      />
                    </label>
                    <label title="オーバーレイの不透明度(0-1)。0で透明、1で不透明。">
                      オーバーレイ不透明度
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={config?.overlay_alpha ?? 0.35}
                        onChange={(e) => setNumberField('overlay_alpha', e.target.value)}
                      />
                    </label>
                  </div>
                </div>

                <div className="card">
                  <div className="label">遅延監視</div>
                  <div className="form-grid">
                    <label title="新着画像がこない場合にWarningを出すまでの秒数。">
                      遅延閾値(秒)
                      <input
                        type="number"
                        value={config?.delay_threshold_seconds ?? ''}
                        onChange={(e) => setNumberField('delay_threshold_seconds', e.target.value)}
                      />
                    </label>
                    <label className="row" title="遅延監視の有効/無効を切り替えます。">
                      遅延監視
                      <Toggle on={config?.delay_monitor_enabled ?? false} label="" onClick={toggleDelay} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="settings-columns">
                <div className="card">
                  <div className="label">警報・GPIO/Slack</div>
                  <div className="form-grid">
                    <label className="row" title="警報の有効/無効を切り替えます。GPIO出力・Slack通知も連動します。">
                      警報
                      <Toggle on={config?.alarm_enabled ?? false} label="" onClick={toggleAlarm} />
                    </label>
                    <label title="GPIO出力するピン番号（BCM番号）。">
                      GPIOピン
                      <input
                        type="number"
                        value={config?.gpio_pin ?? ''}
                        onChange={(e) => setNumberField('gpio_pin', e.target.value)}
                      />
                    </label>
                    <label title="Slack Webhook URL（テキスト通知用）。空なら無効。">
                      Slack Webhook
                      <input
                        type="text"
                        value={config?.slack_webhook_url ?? ''}
                        onChange={(e) =>
                          setConfig((prev) => (prev ? { ...prev, slack_webhook_url: e.target.value } : prev))
                        }
                      />
                    </label>
                    <label title="Slack Bot Token（画像添付用）。空なら添付せずWebhookのみ。">
                      Slack Bot Token
                      <input
                        type="password"
                        value={config?.slack_bot_token ?? ''}
                        onChange={(e) =>
                          setConfig((prev) => (prev ? { ...prev, slack_bot_token: e.target.value } : prev))
                        }
                      />
                    </label>
                    <label title="Slackに投稿するチャンネル（Bot Token利用時）。">
                      Slack Channel
                      <input
                        type="text"
                        value={config?.slack_channel ?? ''}
                        onChange={(e) =>
                          setConfig((prev) => (prev ? { ...prev, slack_channel: e.target.value } : prev))
                        }
                      />
                    </label>
                  </div>
                </div>

                <div className="card">
                  <div className="label">マスク設定（モノクロ画像アップロード）</div>
                  <div className="mask-controls">
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" />
                    <button onClick={uploadMask}>マスク画像を適用</button>
                    <button onClick={resetMask}>マスクリセット</button>
                  </div>
                  <div className="form-grid">
                    <label className="row" title="ON: アップロードしたマスクの白い範囲のみ検出。OFF: マスクを無視して全域を検出。">
                      マスク適用
                      <Toggle
                        on={config?.mask_inclusive ?? true}
                        label=""
                        onClick={async () => {
                          if (!config || toggleBusy) return
                          const next = !(config.mask_inclusive ?? true)
                          setToggleBusy(true)
                          setConfig((prev) => (prev ? { ...prev, mask_inclusive: next } : prev))
                          try {
                            await api.updateConfig({ mask_inclusive: next })
                            const cfg = await api.getConfig()
                            setConfig(cfg.settings)
                            setMaskImageUrl((prev) => (prev ? `${prev.split('?')[0]}?v=${Date.now()}` : prev))
                            setActionMessage(`マスク適用を${next ? 'ON' : 'OFF'}にしました`)
                          } catch (e) {
                            setConfig((prev) => (prev ? { ...prev, mask_inclusive: !next } : prev))
                            setActionMessage(
                              `マスクモード切替失敗: ${e instanceof Error ? e.message : 'unknown error'}`,
                            )
                          } finally {
                            setToggleBusy(false)
                            await fetchAll(true)
                          }
                        }}
                        disabled={toggleBusy}
                      />
                    </label>
                  </div>
                  <div className="mask-preview">
                    {maskImageUrl ? (
                      <img src={maskImageUrl} alt="mask" />
                    ) : (
                      <div className="muted">マスク画像が未設定です</div>
                    )}
                  </div>
                  <div className="label sub">マスク適用ON時: 白=検出対象、黒=除外。OFF時: マスクを無視して全域を検出。</div>
                </div>
              </div>
              <div className="settings-actions bottom">
                <div className="settings-import-export">
                  <input
                    ref={importFileRef}
                    type="file"
                    accept="application/json"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleImportConfig(file)
                    }}
                  />
                  <button className="ghost" onClick={() => importFileRef.current?.click()}>
                    設定をインポート
                  </button>
                  <button className="ghost" onClick={handleExportConfig}>
                    設定をエクスポート
                  </button>
                </div>
                <button onClick={saveConfig} disabled={!config}>
                  設定を保存
                </button>
              </div>
            </div>
          }
        />
      </Routes>

      {modalImage ? (
        <div className="lightbox" onClick={() => setModalImage(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-header">
              <span>{modalImage.title}</span>
              <button className="ghost" onClick={() => setModalImage(null)}>
                閉じる
              </button>
            </div>
            <div className="lightbox-image">
              <img src={modalImage.base} alt={modalImage.title} />
              {modalImage.overlay ? (
                <img className="overlay strong" src={modalImage.overlay} alt={`${modalImage.title} overlay`} />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App

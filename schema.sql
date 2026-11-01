CREATE TABLE IF NOT EXISTS daily_usage (
  device_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= 2),
  PRIMARY KEY (device_id, usage_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage(usage_date);

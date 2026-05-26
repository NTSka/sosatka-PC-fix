package storage

import (
	"context"
	"database/sql"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
	mu sync.Mutex
}

type Sample struct {
	ID          int64     `json:"id"`
	Timestamp   time.Time `json:"timestamp"`
	Kind        string    `json:"kind"`
	InterfaceID *string   `json:"interface_id,omitempty"`
	Metric      string    `json:"metric"`
	Value       *float64  `json:"value,omitempty"`
	Unit        string    `json:"unit,omitempty"`
	Error       string    `json:"error,omitempty"`
	Details     string    `json:"details,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type SeriesPoint struct {
	Timestamp   time.Time `json:"timestamp"`
	Kind        string    `json:"kind"`
	InterfaceID string    `json:"interface_id,omitempty"`
	Metric      string    `json:"metric"`
	Value       float64   `json:"value"`
	Unit        string    `json:"unit,omitempty"`
	Details     string    `json:"details,omitempty"`
}

func Open(dataDir string) (*Store, error) {
	db, err := sql.Open("sqlite", filepath.Join(dataDir, "pc-debug.db"))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)

	store := &Store{db: db}
	if err := store.configure(context.Background()); err != nil {
		db.Close()
		return nil, err
	}
	if err := store.migrate(context.Background()); err != nil {
		db.Close()
		return nil, err
	}

	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) configure(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
`)
	return err
}

func (s *Store) migrate(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.ExecContext(ctx, `
CREATE TABLE IF NOT EXISTS settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS samples (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	timestamp DATETIME NOT NULL,
	kind TEXT NOT NULL,
	interface_id TEXT,
	metric TEXT NOT NULL,
	value REAL,
	unit TEXT,
	error TEXT,
	details TEXT,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_samples_timestamp ON samples(timestamp);
CREATE INDEX IF NOT EXISTS idx_samples_kind_timestamp ON samples(kind, timestamp);
CREATE INDEX IF NOT EXISTS idx_samples_interface_timestamp ON samples(interface_id, timestamp);
`)
	return err
}

func (s *Store) GetSetting(ctx context.Context, key string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var value string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

func (s *Store) SetSetting(ctx context.Context, key string, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.ExecContext(ctx, `
INSERT INTO settings(key, value, updated_at)
VALUES(?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
`, key, value)
	return err
}

func (s *Store) InsertSample(ctx context.Context, sample Sample) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.ExecContext(ctx, `
INSERT INTO samples(timestamp, kind, interface_id, metric, value, unit, error, details)
VALUES(?, ?, ?, ?, ?, ?, ?, ?)
`, sample.Timestamp, sample.Kind, sample.InterfaceID, sample.Metric, sample.Value, sample.Unit, sample.Error, sample.Details)
	return err
}

func (s *Store) RecentSamples(ctx context.Context, limit int) ([]Sample, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := s.db.QueryContext(ctx, `
SELECT id, timestamp, kind, interface_id, metric, value, unit, error, details, created_at
FROM samples
ORDER BY timestamp DESC, id DESC
LIMIT ?
`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanSamples(rows)
}

func (s *Store) RecentSamplesByKind(ctx context.Context, kind string, limit int) ([]Sample, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := s.db.QueryContext(ctx, `
SELECT id, timestamp, kind, interface_id, metric, value, unit, error, details, created_at
FROM samples
WHERE kind = ?
ORDER BY timestamp DESC, id DESC
LIMIT ?
`, kind, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanSamples(rows)
}

func scanSamples(rows *sql.Rows) ([]Sample, error) {
	var samples []Sample
	for rows.Next() {
		var sample Sample
		var interfaceID, unit, sampleErr, details sql.NullString
		var value sql.NullFloat64
		if err := rows.Scan(&sample.ID, &sample.Timestamp, &sample.Kind, &interfaceID, &sample.Metric, &value, &unit, &sampleErr, &details, &sample.CreatedAt); err != nil {
			return nil, err
		}
		if interfaceID.Valid {
			sample.InterfaceID = &interfaceID.String
		}
		if value.Valid {
			sample.Value = &value.Float64
		}
		if unit.Valid {
			sample.Unit = unit.String
		}
		if sampleErr.Valid {
			sample.Error = sampleErr.String
		}
		if details.Valid {
			sample.Details = details.String
		}
		samples = append(samples, sample)
	}

	return samples, rows.Err()
}

func (s *Store) Series(ctx context.Context, since time.Time, kind string) ([]SeriesPoint, error) {
	return s.SeriesRange(ctx, since, time.Now().UTC(), kind)
}

func (s *Store) SeriesRange(ctx context.Context, from time.Time, to time.Time, kind string) ([]SeriesPoint, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	query := `
SELECT timestamp, kind, COALESCE(interface_id, ''), metric, value, COALESCE(unit, ''), COALESCE(details, '')
FROM samples
WHERE timestamp >= ? AND timestamp <= ? AND value IS NOT NULL
`
	args := []any{from, to}
	if kind != "" {
		query += ` AND kind = ?`
		args = append(args, kind)
	}
	query += ` ORDER BY timestamp ASC, id ASC`

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []SeriesPoint
	for rows.Next() {
		var point SeriesPoint
		if err := rows.Scan(&point.Timestamp, &point.Kind, &point.InterfaceID, &point.Metric, &point.Value, &point.Unit, &point.Details); err != nil {
			return nil, err
		}
		points = append(points, point)
	}

	return points, rows.Err()
}

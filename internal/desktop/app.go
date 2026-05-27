package desktop

import (
	"context"
	"time"

	"pc-debug/internal/collectors"
	"pc-debug/internal/config"
	"pc-debug/internal/storage"
)

type App struct {
	store    *storage.Store
	settings *config.Manager
	agent    *collectors.Agent
}

func New(dataDir string) (*App, error) {
	store, err := storage.Open(dataDir)
	if err != nil {
		return nil, err
	}

	settings, err := config.NewManager(store)
	if err != nil {
		store.Close()
		return nil, err
	}

	return &App{
		store:    store,
		settings: settings,
		agent:    collectors.NewAgent(store, settings),
	}, nil
}

func (a *App) Startup(ctx context.Context) {
	a.agent.Run(ctx)
}

func (a *App) Close() error {
	if a.store == nil {
		return nil
	}
	return a.store.Close()
}

func (a *App) GetSettings() config.Settings {
	return a.settings.Get()
}

func (a *App) SetSettings(next config.Settings) (config.Settings, error) {
	return a.settings.Set(next)
}

func (a *App) RecentSamples(limit int) ([]storage.Sample, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	return a.store.RecentSamples(context.Background(), limit)
}

func (a *App) RecentSnapshots(limit int) ([]storage.Sample, error) {
	if limit <= 0 || limit > 200 {
		limit = 40
	}
	return a.store.RecentSamplesByKind(context.Background(), "network_snapshot", limit)
}

func (a *App) Series(kind string, minutes int) ([]storage.SeriesPoint, error) {
	if minutes <= 0 || minutes > 1440 {
		minutes = 30
	}
	return a.store.Series(context.Background(), time.Now().UTC().Add(-time.Duration(minutes)*time.Minute), kind)
}

func (a *App) SeriesRange(kind string, from string, to string) ([]storage.SeriesPoint, error) {
	start, err := time.Parse(time.RFC3339, from)
	if err != nil {
		return nil, err
	}
	end, err := time.Parse(time.RFC3339, to)
	if err != nil {
		return nil, err
	}
	if end.Before(start) {
		start, end = end, start
	}
	if end.Sub(start) > 24*time.Hour {
		start = end.Add(-24 * time.Hour)
	}
	return a.store.SeriesRange(context.Background(), start.UTC(), end.UTC(), kind)
}

func (a *App) SeriesRollup(kind string, from string, to string, bucketSeconds int) ([]storage.SeriesPoint, error) {
	start, err := time.Parse(time.RFC3339, from)
	if err != nil {
		return nil, err
	}
	end, err := time.Parse(time.RFC3339, to)
	if err != nil {
		return nil, err
	}
	if end.Before(start) {
		start, end = end, start
	}
	if end.Sub(start) > 24*time.Hour {
		start = end.Add(-24 * time.Hour)
	}
	if bucketSeconds < 1 {
		bucketSeconds = 1
	}
	if bucketSeconds > 3600 {
		bucketSeconds = 3600
	}
	return a.store.SeriesRollup(context.Background(), start.UTC(), end.UTC(), kind, time.Duration(bucketSeconds)*time.Second)
}

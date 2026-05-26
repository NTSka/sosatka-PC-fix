package config

import (
	"context"
	"encoding/json"
	"errors"
	"sync"

	"pc-debug/internal/storage"
)

const (
	minIntervalSeconds            = 1
	maxIntervalSeconds            = 3600
	defaultSystemIntervalSeconds  = 5
	defaultStatusIntervalSeconds  = 5
	defaultProbeIntervalSeconds   = 15
	defaultSnapshotIntervalSecond = 60
	defaultProcessIntervalSeconds = 15
	settingsKey                   = "settings"
)

type Settings struct {
	SystemIntervalSeconds          int  `json:"system_interval_seconds"`
	NetworkIntervalSeconds         int  `json:"network_interval_seconds,omitempty"`
	NetworkStatusIntervalSeconds   int  `json:"network_status_interval_seconds"`
	NetworkProbeIntervalSeconds    int  `json:"network_probe_interval_seconds"`
	NetworkSnapshotIntervalSeconds int  `json:"network_snapshot_interval_seconds"`
	ProcessIntervalSeconds         int  `json:"process_interval_seconds"`
	CollectSystem                  bool `json:"collect_system"`
	CollectNetwork                 bool `json:"collect_network"`
	CollectProcesses               bool `json:"collect_processes"`
}

type Manager struct {
	mu       sync.RWMutex
	store    *storage.Store
	current  Settings
	watchers []chan Settings
}

func NewManager(store *storage.Store) (*Manager, error) {
	manager := &Manager{store: store}

	loaded, err := store.GetSetting(context.Background(), settingsKey)
	if err != nil {
		return nil, err
	}

	if loaded == "" {
		manager.current = Defaults()
		if err := manager.persist(context.Background(), manager.current); err != nil {
			return nil, err
		}
		return manager, nil
	}

	var settings Settings
	if err := json.Unmarshal([]byte(loaded), &settings); err != nil {
		return nil, err
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal([]byte(loaded), &raw); err != nil {
		return nil, err
	}
	if _, ok := raw["collect_processes"]; !ok {
		settings.CollectProcesses = true
	}

	normalized, err := Normalize(settings)
	if err != nil {
		return nil, err
	}
	manager.current = normalized

	return manager, nil
}

func Defaults() Settings {
	return Settings{
		SystemIntervalSeconds:          defaultSystemIntervalSeconds,
		NetworkIntervalSeconds:         defaultStatusIntervalSeconds,
		NetworkStatusIntervalSeconds:   defaultStatusIntervalSeconds,
		NetworkProbeIntervalSeconds:    defaultProbeIntervalSeconds,
		NetworkSnapshotIntervalSeconds: defaultSnapshotIntervalSecond,
		ProcessIntervalSeconds:         defaultProcessIntervalSeconds,
		CollectSystem:                  true,
		CollectNetwork:                 true,
		CollectProcesses:               true,
	}
}

func Normalize(settings Settings) (Settings, error) {
	if settings.SystemIntervalSeconds == 0 {
		settings.SystemIntervalSeconds = defaultSystemIntervalSeconds
	}
	if settings.NetworkStatusIntervalSeconds == 0 {
		if settings.NetworkIntervalSeconds > 0 {
			settings.NetworkStatusIntervalSeconds = settings.NetworkIntervalSeconds
		} else {
			settings.NetworkStatusIntervalSeconds = defaultStatusIntervalSeconds
		}
	}
	if settings.NetworkProbeIntervalSeconds == 0 {
		settings.NetworkProbeIntervalSeconds = defaultProbeIntervalSeconds
	}
	if settings.NetworkSnapshotIntervalSeconds == 0 {
		settings.NetworkSnapshotIntervalSeconds = defaultSnapshotIntervalSecond
	}
	if settings.ProcessIntervalSeconds == 0 {
		settings.ProcessIntervalSeconds = defaultProcessIntervalSeconds
	}
	if settings.NetworkIntervalSeconds == 0 {
		settings.NetworkIntervalSeconds = settings.NetworkStatusIntervalSeconds
	}

	if settings.SystemIntervalSeconds < minIntervalSeconds || settings.SystemIntervalSeconds > maxIntervalSeconds {
		return Settings{}, errors.New("system interval must be between 1 and 3600 seconds")
	}
	if settings.NetworkStatusIntervalSeconds < minIntervalSeconds || settings.NetworkStatusIntervalSeconds > maxIntervalSeconds {
		return Settings{}, errors.New("network status interval must be between 1 and 3600 seconds")
	}
	if settings.NetworkProbeIntervalSeconds < minIntervalSeconds || settings.NetworkProbeIntervalSeconds > maxIntervalSeconds {
		return Settings{}, errors.New("network probe interval must be between 1 and 3600 seconds")
	}
	if settings.NetworkSnapshotIntervalSeconds < minIntervalSeconds || settings.NetworkSnapshotIntervalSeconds > maxIntervalSeconds {
		return Settings{}, errors.New("network snapshot interval must be between 1 and 3600 seconds")
	}
	if settings.ProcessIntervalSeconds < minIntervalSeconds || settings.ProcessIntervalSeconds > maxIntervalSeconds {
		return Settings{}, errors.New("process interval must be between 1 and 3600 seconds")
	}
	settings.NetworkIntervalSeconds = settings.NetworkStatusIntervalSeconds

	return settings, nil
}

func (m *Manager) Get() Settings {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.current
}

func (m *Manager) Set(next Settings) (Settings, error) {
	normalized, err := Normalize(next)
	if err != nil {
		return Settings{}, err
	}

	m.mu.Lock()
	m.current = normalized
	watchers := append([]chan Settings(nil), m.watchers...)
	m.mu.Unlock()

	if err := m.persist(context.Background(), normalized); err != nil {
		return Settings{}, err
	}

	for _, watcher := range watchers {
		select {
		case watcher <- normalized:
		default:
		}
	}

	return normalized, nil
}

func (m *Manager) Watch() <-chan Settings {
	ch := make(chan Settings, 1)

	m.mu.Lock()
	m.watchers = append(m.watchers, ch)
	current := m.current
	m.mu.Unlock()

	ch <- current
	return ch
}

func (m *Manager) persist(ctx context.Context, settings Settings) error {
	encoded, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	return m.store.SetSetting(ctx, settingsKey, string(encoded))
}

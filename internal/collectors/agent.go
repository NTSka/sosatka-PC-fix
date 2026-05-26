package collectors

import (
	"context"
	"log"
	"time"

	"pc-debug/internal/config"
	"pc-debug/internal/storage"
)

type Agent struct {
	store    *storage.Store
	settings *config.Manager
}

func NewAgent(store *storage.Store, settings *config.Manager) *Agent {
	return &Agent{store: store, settings: settings}
}

func (a *Agent) Run(ctx context.Context) {
	systemKick := make(chan struct{}, 1)
	networkStatusKick := make(chan struct{}, 1)
	networkProbeKick := make(chan struct{}, 1)
	networkSnapshotKick := make(chan struct{}, 1)
	processKick := make(chan struct{}, 1)

	go a.runLoop(ctx, "system", a.settings.Watch(), systemKick, func(settings config.Settings) bool {
		return settings.CollectSystem
	}, func(settings config.Settings) time.Duration {
		return time.Duration(settings.SystemIntervalSeconds) * time.Second
	}, a.collectSystem)

	go a.runLoop(ctx, "network status", a.settings.Watch(), networkStatusKick, func(settings config.Settings) bool {
		return settings.CollectNetwork
	}, func(settings config.Settings) time.Duration {
		return time.Duration(settings.NetworkStatusIntervalSeconds) * time.Second
	}, a.collectNetworkStatus)

	go a.runLoop(ctx, "network probe", a.settings.Watch(), networkProbeKick, func(settings config.Settings) bool {
		return settings.CollectNetwork
	}, func(settings config.Settings) time.Duration {
		return time.Duration(settings.NetworkProbeIntervalSeconds) * time.Second
	}, a.collectNetworkProbes)

	go a.runLoop(ctx, "network snapshot", a.settings.Watch(), networkSnapshotKick, func(settings config.Settings) bool {
		return settings.CollectNetwork
	}, func(settings config.Settings) time.Duration {
		return time.Duration(settings.NetworkSnapshotIntervalSeconds) * time.Second
	}, a.collectNetworkSnapshot)

	go a.runLoop(ctx, "process", a.settings.Watch(), processKick, func(settings config.Settings) bool {
		return settings.CollectProcesses
	}, func(settings config.Settings) time.Duration {
		return time.Duration(settings.ProcessIntervalSeconds) * time.Second
	}, a.collectProcesses)

	systemKick <- struct{}{}
	networkStatusKick <- struct{}{}
	networkProbeKick <- struct{}{}
	networkSnapshotKick <- struct{}{}
	processKick <- struct{}{}
}

func (a *Agent) runLoop(
	ctx context.Context,
	name string,
	updates <-chan config.Settings,
	kick <-chan struct{},
	enabled func(config.Settings) bool,
	interval func(config.Settings) time.Duration,
	collect func(context.Context),
) {
	current := a.settings.Get()
	ticker := time.NewTicker(interval(current))
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case next := <-updates:
			current = next
			ticker.Reset(interval(current))
			log.Printf("%s collector interval: %s", name, interval(current))
		case <-kick:
			if enabled(current) {
				collect(ctx)
			}
		case <-ticker.C:
			if enabled(current) {
				collect(ctx)
			}
		}
	}
}

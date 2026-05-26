package main

import (
	"context"
	"embed"
	"log"
	"os"
	"path/filepath"
	"sync"

	"pc-debug/internal/desktop"

	"github.com/getlantern/systray"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/windows/icon.ico
var trayIcon []byte

func main() {
	dataDir, err := appDataDir()
	if err != nil {
		log.Fatal(err)
	}

	app, err := desktop.New(dataDir)
	if err != nil {
		log.Fatal(err)
	}
	defer app.Close()

	tray := newTrayController()
	systray.Register(tray.onReady, nil)

	err = wails.Run(&options.App{
		Title:             "Sosatka PC fix",
		Width:             1180,
		Height:            820,
		HideWindowOnClose: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup: func(ctx context.Context) {
			tray.setContext(ctx)
			app.Startup(ctx)
		},
		OnShutdown: func(ctx context.Context) {
			systray.Quit()
		},
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}

type trayController struct {
	mu  sync.RWMutex
	ctx context.Context
}

func newTrayController() *trayController {
	return &trayController{}
}

func (t *trayController) setContext(ctx context.Context) {
	t.mu.Lock()
	t.ctx = ctx
	t.mu.Unlock()
}

func (t *trayController) context() context.Context {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.ctx
}

func (t *trayController) onReady() {
	systray.SetIcon(trayIcon)
	systray.SetTooltip("Sosatka PC fix")

	open := systray.AddMenuItem("Open", "Show Sosatka PC fix")
	hide := systray.AddMenuItem("Hide", "Hide window to tray")
	systray.AddSeparator()
	quit := systray.AddMenuItem("Quit", "Stop collecting and quit")

	go func() {
		for {
			select {
			case <-open.ClickedCh:
				if ctx := t.context(); ctx != nil {
					wruntime.WindowShow(ctx)
					wruntime.WindowUnminimise(ctx)
				}
			case <-hide.ClickedCh:
				if ctx := t.context(); ctx != nil {
					wruntime.WindowHide(ctx)
				}
			case <-quit.ClickedCh:
				if ctx := t.context(); ctx != nil {
					wruntime.Quit(ctx)
				} else {
					systray.Quit()
				}
				return
			}
		}
	}()
}

func appDataDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}

	dir := filepath.Join(base, "pc-debug")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}

	return dir, nil
}

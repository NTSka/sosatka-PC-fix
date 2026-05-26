package main

import (
	"context"
	"embed"
	"log"
	"os"
	"path/filepath"

	"pc-debug/internal/desktop"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

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

	err = wails.Run(&options.App{
		Title:  "PC Debug",
		Width:  1180,
		Height: 820,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup: func(ctx context.Context) {
			app.Startup(ctx)
		},
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
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

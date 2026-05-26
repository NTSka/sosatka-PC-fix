# Sosatka PC fix

Local Windows diagnostic desktop app prototype.

## Run In Development

```powershell
$wails = Join-Path (go env GOPATH) 'bin\wails.exe'
& $wails dev
```

## Build Desktop App

```powershell
$wails = Join-Path (go env GOPATH) 'bin\wails.exe'
& $wails build
```

The desktop binary is created at:

```text
build\bin\Sosatka PC fix.exe
```

## Current MVP

- Separate configurable collection intervals for system and network metrics.
- Defaults: `5` seconds for system metrics, `5` seconds for network status, `15` seconds for active network probes, and `60` seconds for network snapshots.
- Local SQLite storage in `%AppData%\pc-debug\pc-debug.db`.
- Wails desktop UI with settings, charts, and recent samples.
- Network collection records each local interface separately, including VPN and virtual adapters.
- Cheap interface counters are collected per interface: bytes, packets, errors, and drops.
- TCP connect latency probes per active IPv4 interface for `1.1.1.1:443` and `8.8.8.8:443`.
- DNS query latency probes per active IPv4 interface for Cloudflare, Google, and Yandex DNS.
- HTTP latency probes per active IPv4 interface for `https://www.gstatic.com/generate_204` and `https://ya.ru/`.
- Gateway latency probes per active IPv4 interface.
- DNS probes include both public resolvers and DNS servers assigned to the selected interface.
- HTTP probes record TCP, TLS, TTFB, and total request latency.
- Periodic Windows snapshots include IPv4 routes, DNS servers, adapters, and Wi-Fi interface state.

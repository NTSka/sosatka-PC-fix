package collectors

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"time"

	"pc-debug/internal/storage"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/mem"
)

func (a *Agent) collectSystem(ctx context.Context) {
	now := time.Now().UTC()

	if usage, err := cpu.PercentWithContext(ctx, 0, false); err == nil && len(usage) > 0 {
		a.insertValue(ctx, now, "system", nil, "cpu_total", usage[0], "percent", "")
	} else if err != nil {
		a.insertError(ctx, now, "system", nil, "cpu_total", err)
	}
	if perCore, err := cpu.PercentWithContext(ctx, 0, true); err == nil {
		for index, usage := range perCore {
			details, _ := json.Marshal(map[string]any{"core": index})
			a.insertValue(ctx, now, "system", nil, "cpu_core_usage", usage, "percent", string(details))
		}
	} else {
		a.insertError(ctx, now, "system", nil, "cpu_core_usage", err)
	}

	if vm, err := mem.VirtualMemoryWithContext(ctx); err == nil {
		a.insertValue(ctx, now, "system", nil, "memory_used", vm.UsedPercent, "percent", "")
		a.insertValue(ctx, now, "system", nil, "memory_total_bytes", float64(vm.Total), "bytes", "")
		a.insertValue(ctx, now, "system", nil, "memory_used_bytes", float64(vm.Used), "bytes", "")
		a.insertValue(ctx, now, "system", nil, "memory_available_bytes", float64(vm.Available), "bytes", "")
		a.insertValue(ctx, now, "system", nil, "memory_free_bytes", float64(vm.Free), "bytes", "")
	} else {
		a.insertError(ctx, now, "system", nil, "memory_used", err)
	}

	if usage, err := disk.UsageWithContext(ctx, `C:\`); err == nil {
		details, _ := json.Marshal(map[string]any{
			"path": usage.Path,
			"used": usage.Used,
			"free": usage.Free,
		})
		a.insertValue(ctx, now, "system", nil, "disk_c_used", usage.UsedPercent, "percent", string(details))
	} else {
		a.insertError(ctx, now, "system", nil, "disk_c_used", err)
	}

	if counters, err := disk.IOCountersWithContext(ctx); err == nil {
		for name, counter := range counters {
			details, _ := json.Marshal(map[string]any{"disk": name})
			a.insertValue(ctx, now, "system", nil, "disk_io_read_bytes", float64(counter.ReadBytes), "bytes", string(details))
			a.insertValue(ctx, now, "system", nil, "disk_io_write_bytes", float64(counter.WriteBytes), "bytes", string(details))
			a.insertValue(ctx, now, "system", nil, "disk_io_read_ops", float64(counter.ReadCount), "ops", string(details))
			a.insertValue(ctx, now, "system", nil, "disk_io_write_ops", float64(counter.WriteCount), "ops", string(details))
		}
	} else {
		a.insertError(ctx, now, "system", nil, "disk_io", err)
	}

	a.collectGPU(ctx, now)
}

func (a *Agent) collectGPU(ctx context.Context, now time.Time) {
	rows := powershellJSONRowsWithTimeout(ctx, `
$rows = @()
$name = ((Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ', ')
$rows += [pscustomobject]@{Kind='present'; Name=$name; Value=1}
try {
  $samples = (Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction Stop).CounterSamples |
    Where-Object { $_.InstanceName -notmatch '^pid_0_' }
  $sum = ($samples | Measure-Object -Property CookedValue -Sum).Sum
  if ($null -ne $sum) { $rows += [pscustomobject]@{Kind='total'; Name=$name; Value=[Math]::Min(100, [double]$sum)} }
  $samples | Group-Object {
    if ($_.InstanceName -match 'engtype_([^_]+)') { $Matches[1] } else { 'unknown' }
  } | ForEach-Object {
    $engineSum = ($_.Group | Measure-Object -Property CookedValue -Sum).Sum
    if ($null -ne $engineSum) {
      $rows += [pscustomobject]@{Kind='engine'; Name=$name; EngineType=$_.Name; Value=[Math]::Min(100, [double]$engineSum)}
    }
  }
} catch {}
try {
  $sum = ((Get-Counter '\GPU Adapter Memory(*)\Dedicated Usage' -ErrorAction Stop).CounterSamples |
    Measure-Object -Property CookedValue -Sum).Sum
  if ($null -ne $sum) { $rows += [pscustomobject]@{Kind='dedicated_memory'; Name=$name; Value=[double]$sum} }
} catch {}
try {
  $sum = ((Get-Counter '\GPU Adapter Memory(*)\Shared Usage' -ErrorAction Stop).CounterSamples |
    Measure-Object -Property CookedValue -Sum).Sum
  if ($null -ne $sum) { $rows += [pscustomobject]@{Kind='shared_memory'; Name=$name; Value=[double]$sum} }
} catch {}
$rows | ConvertTo-Json -Compress
`, 12*time.Second)
	if len(rows) == 0 {
		a.insertError(ctx, now, "system", nil, "gpu", errGPUCountersUnavailable{})
		return
	}
	for _, row := range rows {
		name, _ := row["Name"].(string)
		kind, _ := row["Kind"].(string)
		engineType, _ := row["EngineType"].(string)
		details, _ := json.Marshal(map[string]any{"name": name, "engine_type": engineType})
		value, ok := floatFromAny(row["Value"])
		if !ok {
			continue
		}
		switch kind {
		case "present":
			a.insertValue(ctx, now, "system", nil, "gpu_present", value, "bool", string(details))
		case "total":
			a.insertValue(ctx, now, "system", nil, "gpu_utilization", value, "percent", string(details))
		case "engine":
			a.insertValue(ctx, now, "system", nil, "gpu_engine_utilization", value, "percent", string(details))
		case "dedicated_memory":
			a.insertValue(ctx, now, "system", nil, "gpu_dedicated_bytes", value, "bytes", string(details))
		case "shared_memory":
			a.insertValue(ctx, now, "system", nil, "gpu_shared_bytes", value, "bytes", string(details))
		}
	}
}

type errGPUCountersUnavailable struct{}

func (errGPUCountersUnavailable) Error() string {
	return "gpu counters unavailable or timed out"
}

func floatFromAny(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, !math.IsNaN(typed)
	case int:
		return float64(typed), true
	default:
		return 0, false
	}
}

func (a *Agent) insertValue(ctx context.Context, ts time.Time, kind string, interfaceID *string, metric string, value float64, unit string, details string) {
	if err := a.store.InsertSample(ctx, storage.Sample{
		Timestamp:   ts,
		Kind:        kind,
		InterfaceID: interfaceID,
		Metric:      metric,
		Value:       &value,
		Unit:        unit,
		Details:     details,
	}); err != nil {
		log.Printf("insert sample: %v", err)
	}
}

func (a *Agent) insertSampleDetails(ctx context.Context, ts time.Time, kind string, interfaceID *string, metric string, details string) {
	if err := a.store.InsertSample(ctx, storage.Sample{
		Timestamp:   ts,
		Kind:        kind,
		InterfaceID: interfaceID,
		Metric:      metric,
		Details:     details,
	}); err != nil {
		log.Printf("insert details sample: %v", err)
	}
}

func (a *Agent) insertError(ctx context.Context, ts time.Time, kind string, interfaceID *string, metric string, err error) {
	a.insertErrorWithDetails(ctx, ts, kind, interfaceID, metric, err, "")
}

func (a *Agent) insertErrorWithDetails(ctx context.Context, ts time.Time, kind string, interfaceID *string, metric string, err error, details string) {
	if err := a.store.InsertSample(ctx, storage.Sample{
		Timestamp:   ts,
		Kind:        kind,
		InterfaceID: interfaceID,
		Metric:      metric,
		Error:       err.Error(),
		Details:     details,
	}); err != nil {
		log.Printf("insert error sample: %v", err)
	}
}

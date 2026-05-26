package collectors

import (
	"context"
	"encoding/json"
	"sort"
	"time"

	"github.com/shirou/gopsutil/v4/process"
)

const maxProcessRows = 40

type processSample struct {
	pid          int32
	name         string
	exe          string
	cpuSeconds   float64
	rssBytes     uint64
	memoryPct    float32
	readBytes    uint64
	writeBytes   uint64
	threadCount  int32
	hasCPU       bool
	hasMemory    bool
	hasMemoryPct bool
	hasIO        bool
	hasThreads   bool
}

func (a *Agent) collectProcesses(ctx context.Context) {
	collectCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	now := time.Now().UTC()
	processes, err := process.ProcessesWithContext(collectCtx)
	if err != nil {
		a.insertError(ctx, now, "process", nil, "process_list", err)
		return
	}

	samples := make([]processSample, 0, len(processes))
	for _, item := range processes {
		if collectCtx.Err() != nil {
			break
		}
		sample := processSample{pid: item.Pid}
		if name, err := item.NameWithContext(collectCtx); err == nil {
			sample.name = name
		}
		if sample.name == "" {
			sample.name = "pid " + int32String(item.Pid)
		}
		if exe, err := item.ExeWithContext(collectCtx); err == nil {
			sample.exe = exe
		}
		if times, err := item.TimesWithContext(collectCtx); err == nil && times != nil {
			sample.cpuSeconds = times.User + times.System
			sample.hasCPU = true
		}
		if memory, err := item.MemoryInfoWithContext(collectCtx); err == nil && memory != nil {
			sample.rssBytes = memory.RSS
			sample.hasMemory = true
		}
		if pct, err := item.MemoryPercentWithContext(collectCtx); err == nil {
			sample.memoryPct = pct
			sample.hasMemoryPct = true
		}
		if io, err := item.IOCountersWithContext(collectCtx); err == nil && io != nil {
			sample.readBytes = io.ReadBytes
			sample.writeBytes = io.WriteBytes
			sample.hasIO = true
		}
		if threads, err := item.NumThreadsWithContext(collectCtx); err == nil {
			sample.threadCount = threads
			sample.hasThreads = true
		}
		if sample.hasCPU || sample.hasMemory || sample.hasMemoryPct || sample.hasIO || sample.hasThreads {
			samples = append(samples, sample)
		}
	}

	for _, sample := range selectProcessSamples(samples) {
		details, _ := json.Marshal(map[string]any{
			"pid":  sample.pid,
			"name": sample.name,
			"exe":  sample.exe,
		})
		detailText := string(details)
		if sample.hasCPU {
			a.insertValue(ctx, now, "process", nil, "process_cpu_seconds", sample.cpuSeconds, "seconds", detailText)
		}
		if sample.hasMemory {
			a.insertValue(ctx, now, "process", nil, "process_memory_rss_bytes", float64(sample.rssBytes), "bytes", detailText)
		}
		if sample.hasMemoryPct {
			a.insertValue(ctx, now, "process", nil, "process_memory_percent", float64(sample.memoryPct), "percent", detailText)
		}
		if sample.hasIO {
			a.insertValue(ctx, now, "process", nil, "process_io_read_bytes", float64(sample.readBytes), "bytes", detailText)
			a.insertValue(ctx, now, "process", nil, "process_io_write_bytes", float64(sample.writeBytes), "bytes", detailText)
		}
		if sample.hasThreads {
			a.insertValue(ctx, now, "process", nil, "process_threads", float64(sample.threadCount), "count", detailText)
		}
	}
}

func selectProcessSamples(samples []processSample) []processSample {
	selected := make(map[int32]processSample)
	addTop := func(score func(processSample) float64) {
		copySamples := append([]processSample(nil), samples...)
		sort.Slice(copySamples, func(i, j int) bool {
			return score(copySamples[i]) > score(copySamples[j])
		})
		for i, sample := range copySamples {
			if i >= maxProcessRows {
				return
			}
			selected[sample.pid] = sample
		}
	}

	addTop(func(sample processSample) float64 {
		return float64(sample.rssBytes)
	})
	addTop(func(sample processSample) float64 {
		return float64(sample.readBytes + sample.writeBytes)
	})
	addTop(func(sample processSample) float64 {
		return sample.cpuSeconds
	})

	result := make([]processSample, 0, len(selected))
	for _, sample := range selected {
		result = append(result, sample)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].name < result[j].name
	})
	return result
}

func int32String(value int32) string {
	if value == 0 {
		return "0"
	}
	negative := value < 0
	if negative {
		value = -value
	}
	buf := [12]byte{}
	index := len(buf)
	for value > 0 {
		index--
		buf[index] = byte('0' + value%10)
		value /= 10
	}
	if negative {
		index--
		buf[index] = '-'
	}
	return string(buf[index:])
}

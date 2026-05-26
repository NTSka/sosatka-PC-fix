import "./styles.css";
import { GetSettings, RecentSnapshots, SeriesRange, SetSettings } from "../wailsjs/go/desktop/App";

const els = {
  form: document.querySelector("#settings"),
  systemInterval: document.querySelector("#systemInterval"),
  networkStatusInterval: document.querySelector("#networkStatusInterval"),
  networkProbeInterval: document.querySelector("#networkProbeInterval"),
  networkSnapshotInterval: document.querySelector("#networkSnapshotInterval"),
  processInterval: document.querySelector("#processInterval"),
  collectSystem: document.querySelector("#collectSystem"),
  collectNetwork: document.querySelector("#collectNetwork"),
  collectProcesses: document.querySelector("#collectProcesses"),
  refresh: document.querySelector("#refresh"),
  cpuChart: document.querySelector("#cpuChart"),
  cpuCoresChart: document.querySelector("#cpuCoresChart"),
  memoryChart: document.querySelector("#memoryChart"),
  diskIOChart: document.querySelector("#diskIOChart"),
  diskUsageChart: document.querySelector("#diskUsageChart"),
  gpuEnginesChart: document.querySelector("#gpuEnginesChart"),
  gpuMemoryChart: document.querySelector("#gpuMemoryChart"),
  networkChart: document.querySelector("#networkChart"),
  gatewayChart: document.querySelector("#gatewayChart"),
  trafficChart: document.querySelector("#trafficChart"),
  errorsChart: document.querySelector("#errorsChart"),
  tcpChart: document.querySelector("#tcpChart"),
  dnsChart: document.querySelector("#dnsChart"),
  httpChart: document.querySelector("#httpChart"),
  httpBreakdownChart: document.querySelector("#httpBreakdownChart"),
  cpuLegend: document.querySelector("#cpuLegend"),
  cpuCoresLegend: document.querySelector("#cpuCoresLegend"),
  memoryLegend: document.querySelector("#memoryLegend"),
  diskIOLegend: document.querySelector("#diskIOLegend"),
  diskUsageLegend: document.querySelector("#diskUsageLegend"),
  gpuEnginesLegend: document.querySelector("#gpuEnginesLegend"),
  gpuMemoryLegend: document.querySelector("#gpuMemoryLegend"),
  networkLegend: document.querySelector("#networkLegend"),
  gatewayLegend: document.querySelector("#gatewayLegend"),
  trafficLegend: document.querySelector("#trafficLegend"),
  errorsLegend: document.querySelector("#errorsLegend"),
  tcpLegend: document.querySelector("#tcpLegend"),
  dnsLegend: document.querySelector("#dnsLegend"),
  httpLegend: document.querySelector("#httpLegend"),
  httpBreakdownLegend: document.querySelector("#httpBreakdownLegend"),
  timelineWindow: document.querySelector("#timelineWindow"),
  timelineFrom: document.querySelector("#timelineFrom"),
  timelineTo: document.querySelector("#timelineTo"),
  interfaceSelect: document.querySelector("#interfaceSelect"),
  interfaceList: document.querySelector("#interfaceList"),
  trafficSummary: document.querySelector("#trafficSummary"),
  reliabilitySummary: document.querySelector("#reliabilitySummary"),
  configSummary: document.querySelector("#configSummary"),
  anomalyCount: document.querySelector("#anomalyCount"),
  anomalyList: document.querySelector("#anomalyList"),
  showIgnoredAnomalies: document.querySelector("#showIgnoredAnomalies"),
  cpuSummary: document.querySelector("#cpuSummary"),
  memorySummary: document.querySelector("#memorySummary"),
  diskSummary: document.querySelector("#diskSummary"),
  gpuSummary: document.querySelector("#gpuSummary"),
  processCpuSummary: document.querySelector("#processCpuSummary"),
  processMemorySummary: document.querySelector("#processMemorySummary"),
  processIOSummary: document.querySelector("#processIOSummary"),
  processCpuTable: document.querySelector("#processCpuTable"),
  processMemoryTable: document.querySelector("#processMemoryTable"),
  processIOTable: document.querySelector("#processIOTable"),
  tabs: document.querySelectorAll("[data-tab]"),
  tabViews: {
    network: document.querySelector("#networkTab"),
    system: document.querySelector("#systemTab"),
    processes: document.querySelector("#processesTab"),
    anomalies: document.querySelector("#anomaliesTab"),
  },
};

const colors = ["#78a6ff", "#f6bd60", "#5dd39e", "#ff6b8a", "#c084fc", "#4dd0e1", "#f28482", "#b8c0ff"];
const chartTheme = {
  background: "#101720",
  grid: "#2d3a4c",
  axis: "#607089",
  text: "#c8d3e2",
  textStrong: "#ffffff",
  tooltip: "#111a26",
  tooltipBorder: "#586a84",
  crosshair: "#94a5bb",
};
let selectedInterface = "";
const chartStates = new WeakMap();
const ignoredAnomalies = loadIgnoredAnomalies();
let currentAnomalies = [];

async function loadSettings() {
  const settings = await GetSettings();
  els.systemInterval.value = settings.system_interval_seconds;
  els.networkStatusInterval.value = settings.network_status_interval_seconds || settings.network_interval_seconds || 5;
  els.networkProbeInterval.value = settings.network_probe_interval_seconds || 15;
  els.networkSnapshotInterval.value = settings.network_snapshot_interval_seconds || 60;
  els.processInterval.value = settings.process_interval_seconds || 15;
  els.collectSystem.checked = settings.collect_system;
  els.collectNetwork.checked = settings.collect_network;
  els.collectProcesses.checked = settings.collect_processes ?? true;
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    await SetSettings({
      system_interval_seconds: Number(els.systemInterval.value),
      network_interval_seconds: Number(els.networkStatusInterval.value),
      network_status_interval_seconds: Number(els.networkStatusInterval.value),
      network_probe_interval_seconds: Number(els.networkProbeInterval.value),
      network_snapshot_interval_seconds: Number(els.networkSnapshotInterval.value),
      process_interval_seconds: Number(els.processInterval.value),
      collect_system: els.collectSystem.checked,
      collect_network: els.collectNetwork.checked,
      collect_processes: els.collectProcesses.checked,
    });
    await loadSettings();
    await refreshData();
  } catch (error) {
    alert(String(error));
  }
}

async function refreshData() {
  await loadCharts();
}

function timelineRange() {
  const selected = els.timelineWindow.value;
  if (selected === "custom") {
    const from = parseLocalDateTime(els.timelineFrom.value) || new Date(Date.now() - 30 * 60 * 1000);
    const to = parseLocalDateTime(els.timelineTo.value) || new Date();
    return normalizeRange(from, to);
  }
  const minutes = Number(selected) || 30;
  return { from: new Date(Date.now() - minutes * 60 * 1000), to: new Date() };
}

function normalizeRange(from, to) {
  if (to.getTime() < from.getTime()) {
    return { from: to, to: from };
  }
  return { from, to };
}

function parseLocalDateTime(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocalDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function syncTimelineRangeInputs() {
  const custom = els.timelineWindow.value === "custom";
  els.timelineFrom.hidden = !custom;
  els.timelineTo.hidden = !custom;
  if (custom && (!els.timelineFrom.value || !els.timelineTo.value)) {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 60 * 1000);
    els.timelineFrom.value = formatLocalDateTime(from);
    els.timelineTo.value = formatLocalDateTime(to);
  }
}

async function loadCharts() {
  const range = timelineRange();
  const [system, network, process, snapshots] = await Promise.all([
    SeriesRange("system", range.from.toISOString(), range.to.toISOString()),
    SeriesRange("network", range.from.toISOString(), range.to.toISOString()),
    SeriesRange("process", range.from.toISOString(), range.to.toISOString()),
    RecentSnapshots(40),
  ]);

  renderSystemSummaries(system);
  renderProcessSummaries(process);
  renderAnomalies(findAnomalies(system, network));

  drawInteractiveChart(els.cpuChart, els.cpuLegend, groupSeries(system.filter((point) => point.metric === "cpu_total"), systemSeriesLabel), {
    min: 0,
    max: 100,
    suffix: "%",
  });
  drawInteractiveChart(els.cpuCoresChart, els.cpuCoresLegend, groupSeries(system.filter((point) => point.metric === "cpu_core_usage"), systemSeriesLabel), {
    min: 0,
    max: 100,
    suffix: "%",
  });
  const memoryBytes = system.filter((point) => ["memory_used_bytes", "memory_available_bytes"].includes(point.metric));
  drawInteractiveChart(els.memoryChart, els.memoryLegend, groupSeries(scaleSeriesValues(memoryBytes, 1 / 1024 / 1024 / 1024), systemSeriesLabel), {
    min: 0,
    suffix: " GB",
  });
  const diskIOBytes = system.filter((point) => ["disk_io_read_bytes", "disk_io_write_bytes"].includes(point.metric));
  drawInteractiveChart(els.diskIOChart, els.diskIOLegend, groupSeries(toRateSeries(diskIOBytes, 1 / 1024 / 1024), systemSeriesLabel), {
    min: 0,
    suffix: " MB/s",
  });
  drawInteractiveChart(els.diskUsageChart, els.diskUsageLegend, groupSeries(system.filter((point) => point.metric === "disk_c_used"), systemSeriesLabel), {
    min: 0,
    max: 100,
    suffix: "%",
  });
  drawInteractiveChart(els.gpuEnginesChart, els.gpuEnginesLegend, groupSeries(system.filter((point) => point.metric === "gpu_utilization" || point.metric === "gpu_engine_utilization"), systemSeriesLabel), {
    min: 0,
    max: 100,
    suffix: "%",
  });
  const gpuMemoryBytes = system.filter((point) => ["gpu_dedicated_bytes", "gpu_shared_bytes"].includes(point.metric));
  drawInteractiveChart(els.gpuMemoryChart, els.gpuMemoryLegend, groupSeries(scaleSeriesValues(gpuMemoryBytes, 1 / 1024 / 1024 / 1024), systemSeriesLabel), {
    min: 0,
    suffix: " GB",
  });

  const interfacePoints = filterByMetric(network, "interface_up");
  const interfaces = buildInterfaceSummaries(interfacePoints, network);
  renderInterfaceSelector(interfaces);
  renderHealthSummaries(network, snapshots);

  const gatewayPoints = filterByInterface(filterByMetric(network, "gateway_ping_ms"), selectedInterface);
  drawInteractiveChart(els.gatewayChart, els.gatewayLegend, groupSeries(gatewayPoints, latencyLabel), {
    min: 0,
    scale: "auto-log",
    suffix: " ms",
  });

  const trafficPoints = filterByInterface(filterByMetric(network, "bytes_sent"), selectedInterface)
    .concat(filterByInterface(filterByMetric(network, "bytes_recv"), selectedInterface));
  drawInteractiveChart(els.trafficChart, els.trafficLegend, groupSeries(toRateSeries(trafficPoints, 1 / 1024), trafficLabel), {
    min: 0,
    suffix: " KB/s",
  });

  const errorPoints = ["errin", "errout", "dropin", "dropout"].flatMap((metric) =>
    filterByInterface(filterByMetric(network, metric), selectedInterface),
  );
  drawInteractiveChart(els.errorsChart, els.errorsLegend, groupSeries(toRateSeries(errorPoints, 1), (p) => p.metric), {
    min: 0,
    suffix: "/s",
  });

  const scopedInterfacePoints = filterByInterface(interfacePoints, selectedInterface);
  drawInteractiveChart(els.networkChart, els.networkLegend, groupSeries(scopedInterfacePoints, (p) => p.interface_id || "unknown"), {
    min: 0,
    max: 1,
    suffix: "",
    step: true,
    valueFormatter: (value) => value >= 0.5 ? "up" : "down",
  });

  const tcpPoints = filterByInterface(filterByMetric(network, "tcp_connect_ms"), selectedInterface);
  drawInteractiveChart(els.tcpChart, els.tcpLegend, groupSeries(tcpPoints, latencyLabel), {
    min: 0,
    scale: "auto-log",
    suffix: " ms",
  });

  const dnsPoints = filterByInterface(filterByMetric(network, "dns_query_ms"), selectedInterface);
  drawInteractiveChart(els.dnsChart, els.dnsLegend, groupSeries(dnsPoints, latencyLabel), {
    min: 0,
    scale: "auto-log",
    suffix: " ms",
  });

  const httpPoints = filterByInterface(filterByMetric(network, "http_request_ms"), selectedInterface);
  drawInteractiveChart(els.httpChart, els.httpLegend, groupSeries(httpPoints, latencyLabel), {
    min: 0,
    scale: "auto-log",
    suffix: " ms",
  });

  const httpBreakdownPoints = ["http_tcp_ms", "http_tls_ms", "http_ttfb_ms", "http_total_ms"].flatMap((metric) =>
    filterByInterface(filterByMetric(network, metric), selectedInterface),
  );
  drawInteractiveChart(els.httpBreakdownChart, els.httpBreakdownLegend, groupSeries(httpBreakdownPoints, httpBreakdownLabel), {
    min: 0,
    scale: "auto-log",
    suffix: " ms",
  });
}

function renderHealthSummaries(network, snapshots) {
  const scoped = filterByInterface(network, selectedInterface);
  const latest = latestValues(scoped);
  const rates = latestRates(scoped);
  const snapshot = summarizeSnapshots(snapshots, selectedInterface, network);

  els.trafficSummary.innerHTML = [
    metricRow("RX", formatRate(rates.bytes_recv, "KB/s")),
    metricRow("TX", formatRate(rates.bytes_sent, "KB/s")),
    metricRow("RX total", formatBytes(latest.bytes_recv)),
    metricRow("TX total", formatBytes(latest.bytes_sent)),
  ].join("");

  els.reliabilitySummary.innerHTML = [
    metricRow("Errors in/out", `${formatCount(latest.errin)} / ${formatCount(latest.errout)}`),
    metricRow("Drops in/out", `${formatCount(latest.dropin)} / ${formatCount(latest.dropout)}`),
    metricRow("Gateway", `${successRate(scoped, "gateway_ping_success")} ok, jitter ${formatMs(jitter(scoped, "gateway_ping_ms"))}`),
    metricRow("DNS", `${successRate(scoped, "dns_query_success")} ok, jitter ${formatMs(jitter(scoped, "dns_query_ms"))}`),
    metricRow("HTTP", `${successRate(scoped, "http_request_success")} ok, jitter ${formatMs(jitter(scoped, "http_request_ms"))}`),
    metricRow("Targets", `${countTargets(scoped, "tcp_connect_ms")} TCP / ${countTargets(scoped, "http_request_ms")} HTTP`),
  ].join("");

  els.configSummary.innerHTML = [
    metricRow("DNS", snapshot.dns || "unknown"),
    metricRow("Route", snapshot.route || "unknown"),
    metricRow("Adapter", snapshot.adapter || "unknown"),
    metricRow("Wi-Fi", snapshot.wifi || "unknown"),
  ].join("");
}

function renderSystemSummaries(system) {
  const latest = latestValues(system);
  const cpu = metricStats(system, "cpu_total");
  const cpuCoreValues = latestCoreValues(system);
  const disk = metricStats(system, "disk_c_used");
  const diskDetails = latestDetails(system, "disk_c_used");
  const diskRates = latestSystemRates(system);
  const gpu = metricStats(system, "gpu_utilization");
  const gpuDetails = latestDetails(system, "gpu_present");
  const gpuEngines = latestGPUEngineValues(system);

  els.cpuSummary.innerHTML = [
    metricRow("Current", formatPercent(latest.cpu_total)),
    metricRow("Avg", formatPercent(cpu.avg)),
    metricRow("Peak", formatPercent(cpu.max)),
    metricRow("Cores", cpuCoreValues.length ? `${cpuCoreValues.length} cores, peak ${formatPercent(Math.max(...cpuCoreValues))}` : "-"),
    metricRow("State", usageState(latest.cpu_total, 80, 95)),
  ].join("");

  els.memorySummary.innerHTML = [
    metricRow("Used", formatBytes(latest.memory_used_bytes)),
    metricRow("Available", formatBytes(latest.memory_available_bytes)),
    metricRow("Total", formatBytes(latest.memory_total_bytes)),
    metricRow("Used %", formatPercent(latest.memory_used)),
    metricRow("State", usageState(latest.memory_used, 80, 92)),
  ].join("");

  els.diskSummary.innerHTML = [
    metricRow("Used", formatPercent(latest.disk_c_used)),
    metricRow("Free", formatBytes(Number(diskDetails.free))),
    metricRow("Used bytes", formatBytes(Number(diskDetails.used))),
    metricRow("Read", formatRate(diskRates.disk_io_read_bytes, "MB/s")),
    metricRow("Write", formatRate(diskRates.disk_io_write_bytes, "MB/s")),
    metricRow("State", usageState(latest.disk_c_used, 85, 95)),
  ].join("");

  els.gpuSummary.innerHTML = [
    metricRow("Adapter", gpuDetails.name || "unknown"),
    metricRow("Utilization", formatPercent(latest.gpu_utilization)),
    metricRow("3D", formatPercent(gpuEngines["3d"])),
    metricRow("Compute", formatPercent(gpuEngines.compute)),
    metricRow("Copy", formatPercent(gpuEngines.copy)),
    metricRow("Video", formatPercent(Math.max(gpuEngines.videodecode || 0, gpuEngines.videoencode || 0))),
    metricRow("Avg", formatPercent(gpu.avg)),
    metricRow("Peak", formatPercent(gpu.max)),
    metricRow("Dedicated", formatBytes(latest.gpu_dedicated_bytes)),
    metricRow("Shared", formatBytes(latest.gpu_shared_bytes)),
    metricRow("State", Number.isFinite(latest.gpu_utilization) ? "normal" : "no counter data"),
  ].join("");
}

function renderProcessSummaries(process) {
  const cpuRows = topProcessCPURows(process);
  const memoryRows = topProcessMemoryRows(process);
  const ioRows = topProcessIORows(process);

  els.processCpuSummary.innerHTML = [
    metricRow("Tracked", String(countProcesses(process))),
    metricRow("Top", cpuRows[0] ? `${cpuRows[0].name} (${formatPercent(cpuRows[0].cpu)})` : "-"),
    metricRow("Samples", String(process.length)),
  ].join("");

  els.processMemorySummary.innerHTML = [
    metricRow("Top", memoryRows[0] ? `${memoryRows[0].name} (${formatBytes(memoryRows[0].rss)})` : "-"),
    metricRow("Total tracked", formatBytes(memoryRows.reduce((sum, row) => sum + row.rss, 0))),
    metricRow("Rows", String(memoryRows.length)),
  ].join("");

  els.processIOSummary.innerHTML = [
    metricRow("Top", ioRows[0] ? `${ioRows[0].name} (${formatRate(ioRows[0].total, "MB/s")})` : "-"),
    metricRow("Read", formatRate(ioRows.reduce((sum, row) => sum + row.read, 0), "MB/s")),
    metricRow("Write", formatRate(ioRows.reduce((sum, row) => sum + row.write, 0), "MB/s")),
  ].join("");

  els.processCpuTable.innerHTML = processTable(
    ["Process", "PID", "CPU", "Threads"],
    cpuRows.slice(0, 15).map((row) => [row.name, row.pid, formatPercent(row.cpu), formatCount(row.threads)]),
  );
  els.processMemoryTable.innerHTML = processTable(
    ["Process", "PID", "RSS", "Memory %"],
    memoryRows.slice(0, 15).map((row) => [row.name, row.pid, formatBytes(row.rss), formatPercent(row.memoryPercent)]),
  );
  els.processIOTable.innerHTML = processTable(
    ["Process", "PID", "Read", "Write"],
    ioRows.slice(0, 15).map((row) => [row.name, row.pid, formatRate(row.read, "MB/s"), formatRate(row.write, "MB/s")]),
  );
}

function findAnomalies(system, network) {
  const anomalies = [];
  const latestSystem = latestValues(system);
  addThresholdAnomaly(anomalies, "cpu", "CPU total is high", latestSystem.cpu_total, 85, 95, "%");
  addThresholdAnomaly(anomalies, "memory", "Memory pressure is high", latestSystem.memory_used, 85, 92, "%");
  addThresholdAnomaly(anomalies, "disk", "Disk C: is almost full", latestSystem.disk_c_used, 85, 95, "%");
  addThresholdAnomaly(anomalies, "gpu", "GPU utilization is high", latestSystem.gpu_utilization, 85, 95, "%");

  const coreValues = latestCoreValues(system);
  if (coreValues.length > 0) {
    const peakCore = Math.max(...coreValues);
    addThresholdAnomaly(anomalies, "cpu", "One CPU core is saturated", peakCore, 90, 98, "%");
  }

  const diskRates = latestSystemRates(system);
  addThresholdAnomaly(anomalies, "disk", "Disk read throughput is high", diskRates.disk_io_read_bytes, 80, 180, " MB/s");
  addThresholdAnomaly(anomalies, "disk", "Disk write throughput is high", diskRates.disk_io_write_bytes, 80, 180, " MB/s");

  for (const metric of ["gateway_ping_ms", "tcp_connect_ms", "dns_query_ms", "http_request_ms"]) {
    for (const item of seriesGroups(network.filter((point) => point.metric === metric), anomalyNetworkLabel)) {
      const values = item.points.map((point) => Number(point.value)).filter(Number.isFinite).filter((value) => value > 0).sort((a, b) => a - b);
      if (values.length < 6) {
        continue;
      }
      const p90 = percentile(values, 0.9);
      const max = values.at(-1);
      if (max >= 1000 || (max >= 200 && p90 > 0 && max / p90 >= 5)) {
        anomalies.push({
          category: "network",
          detail: `${item.label}: max ${formatMs(max)}, p90 ${formatMs(p90)}`,
          severity: max >= 1000 ? "critical" : "warning",
          title: `${metricLabel(metric)} latency spike`,
        });
      }
    }
  }

  for (const metric of ["gateway_ping_success", "tcp_connect_success", "dns_query_success", "http_request_success"]) {
    for (const item of seriesGroups(network.filter((point) => point.metric === metric), anomalyNetworkLabel)) {
      const values = item.points.map((point) => Number(point.value)).filter(Number.isFinite);
      if (values.length < 4) {
        continue;
      }
      const ok = values.filter((value) => value >= 0.5).length;
      const rate = ok / values.length;
      if (rate < 0.95) {
        anomalies.push({
          category: "network",
          detail: `${item.label}: ${Math.round(rate * 100)}% success over ${values.length} probes`,
          severity: rate < 0.8 ? "critical" : "warning",
          title: `${metricLabel(metric)} failures`,
        });
      }
    }
  }

  const latestInterfaceState = latestBySeries(network.filter((point) => point.metric === "interface_up"), (point) => point.interface_id || "unknown");
  for (const [name, point] of latestInterfaceState) {
    if (Number(point.value) < 0.5) {
      anomalies.push({
        category: "network",
        detail: `${name} is down`,
        severity: "warning",
        title: "Network interface down",
      });
    }
  }

  const networkRates = ["errin", "errout", "dropin", "dropout"].flatMap((metric) => toRateSeries(network.filter((point) => point.metric === metric), 1));
  const badRates = networkRates.filter((point) => Number(point.value) > 0);
  if (badRates.length > 0) {
    const worst = badRates.sort((a, b) => Number(b.value) - Number(a.value))[0];
    anomalies.push({
      category: "network",
      detail: `${worst.interface_id || "unknown"} ${worst.metric}: ${formatRate(worst.value, "/s")}`,
      severity: Number(worst.value) >= 5 ? "critical" : "warning",
      title: "Network errors or drops detected",
    });
  }

  return anomalies.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)).slice(0, 12);
}

function renderAnomalies(anomalies) {
  currentAnomalies = anomalies.map((item) => ({ ...item, key: anomalyKey(item), ignored: ignoredAnomalies.has(anomalyKey(item)) }));
  const active = currentAnomalies.filter((item) => !item.ignored);
  const visible = els.showIgnoredAnomalies.checked ? currentAnomalies : active;

  els.anomalyCount.textContent = String(active.length);
  els.anomalyCount.className = `tab-badge ${active.some((item) => item.severity === "critical") ? "critical" : active.length ? "warning" : "ok"}`;
  if (visible.length === 0) {
    els.anomalyList.innerHTML = `<div class="empty-state">${els.showIgnoredAnomalies.checked ? "No anomalies in the selected window" : "No active anomalies in the selected window"}</div>`;
    return;
  }
  els.anomalyList.innerHTML = visible.map((item) => `
    <div class="anomaly-item ${escapeHtml(item.severity)} ${item.ignored ? "ignored" : ""}">
      <span class="anomaly-severity">${escapeHtml(item.severity)}</span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.detail)}</p>
      </div>
      <button class="anomaly-action" type="button" data-anomaly-action="${item.ignored ? "restore" : "ignore"}" data-anomaly-key="${escapeHtml(item.key)}">
        ${item.ignored ? "Restore" : "Ignore"}
      </button>
    </div>
  `).join("");
}

function anomalyKey(item) {
  return `${item.category}|${item.title}|${item.detail}`;
}

function loadIgnoredAnomalies() {
  try {
    const stored = JSON.parse(localStorage.getItem("ignoredAnomalies") || "[]");
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
}

function saveIgnoredAnomalies() {
  localStorage.setItem("ignoredAnomalies", JSON.stringify(Array.from(ignoredAnomalies)));
}

function toggleIgnoredAnomaly(action, key) {
  if (!key) {
    return;
  }
  if (action === "restore") {
    ignoredAnomalies.delete(key);
  } else {
    ignoredAnomalies.add(key);
  }
  saveIgnoredAnomalies();
  renderAnomalies(currentAnomalies);
}

function addThresholdAnomaly(anomalies, category, title, value, warning, critical, suffix) {
  if (!Number.isFinite(value) || value < warning) {
    return;
  }
  anomalies.push({
    category,
    detail: `${formatAnomalyValue(value, suffix)} current, warning >= ${formatAnomalyValue(warning, suffix)}, critical >= ${formatAnomalyValue(critical, suffix)}`,
    severity: value >= critical ? "critical" : "warning",
    title,
  });
}

function formatAnomalyValue(value, suffix) {
  const precision = Math.abs(value) >= 100 ? 0 : 1;
  return `${value.toFixed(precision)}${suffix}`;
}

function severityRank(severity) {
  return severity === "critical" ? 2 : severity === "warning" ? 1 : 0;
}

function seriesGroups(points, labelFor) {
  const groups = new Map();
  for (const point of points) {
    const label = labelFor(point);
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label).push(point);
  }
  return Array.from(groups, ([label, grouped]) => ({ label, points: grouped }));
}

function latestBySeries(points, labelFor) {
  const latest = new Map();
  for (const point of points) {
    const label = labelFor(point);
    const time = new Date(point.timestamp).getTime();
    const current = latest.get(label);
    if (!current || time > current.time) {
      latest.set(label, { ...point, time });
    }
  }
  return latest;
}

function metricStats(points, metric) {
  const values = points.filter((point) => point.metric === metric).map((point) => Number(point.value)).filter(Number.isFinite);
  if (values.length === 0) {
    return { avg: NaN, max: NaN, min: NaN };
  }
  return {
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    max: Math.max(...values),
    min: Math.min(...values),
  };
}

function latestCoreValues(points) {
  const latestByCore = new Map();
  for (const point of points) {
    if (point.metric !== "cpu_core_usage") {
      continue;
    }
    const core = parseDetails(point.details).core;
    const time = new Date(point.timestamp).getTime();
    const current = latestByCore.get(core);
    if (!current || time > current.time) {
      latestByCore.set(core, { time, value: Number(point.value) });
    }
  }
  return Array.from(latestByCore.values()).map((item) => item.value).filter(Number.isFinite);
}

function latestGPUEngineValues(points) {
  const latestByEngine = new Map();
  for (const point of points) {
    if (point.metric !== "gpu_engine_utilization") {
      continue;
    }
    const engineType = normalizeEngineType(parseDetails(point.details).engine_type);
    const time = new Date(point.timestamp).getTime();
    const current = latestByEngine.get(engineType);
    if (!current || time > current.time) {
      latestByEngine.set(engineType, { time, value: Number(point.value) });
    }
  }
  return Object.fromEntries(Array.from(latestByEngine, ([key, item]) => [key, item.value]));
}

function latestSystemRates(points) {
  const rates = {};
  for (const metric of ["disk_io_read_bytes", "disk_io_write_bytes"]) {
    const converted = toRateSeries(points.filter((point) => point.metric === metric), 1 / 1024 / 1024);
    const totalByTime = sumSeriesByTimestamp(converted);
    const last = totalByTime.sort((a, b) => a.time - b.time).at(-1);
    if (last) {
      rates[metric] = last.value;
    }
  }
  return rates;
}

function sumSeriesByTimestamp(points) {
  const buckets = new Map();
  for (const point of points) {
    const time = new Date(point.timestamp).getTime();
    buckets.set(time, (buckets.get(time) || 0) + Number(point.value || 0));
  }
  return Array.from(buckets, ([time, value]) => ({ time, value }));
}

function latestDetails(points, metric) {
  const sample = points
    .filter((point) => point.metric === metric)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  return parseDetails(sample?.details);
}

function latestValues(points) {
  const values = {};
  for (const point of points) {
    if (point.value === undefined || point.value === null) {
      continue;
    }
    const existing = values[point.metric];
    if (!existing || new Date(point.timestamp).getTime() > existing.time) {
      values[point.metric] = { value: Number(point.value), time: new Date(point.timestamp).getTime() };
    }
  }
  return Object.fromEntries(Object.entries(values).map(([key, item]) => [key, item.value]));
}

function latestRates(points) {
  const rates = {};
  for (const metric of ["bytes_sent", "bytes_recv"]) {
    const converted = toRateSeries(points.filter((p) => p.metric === metric), 1 / 1024);
    const last = converted.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).at(-1);
    if (last) {
      rates[metric] = last.value;
    }
  }
  return rates;
}

function toRateSeries(points, scale) {
  const grouped = new Map();
  for (const point of points) {
    const key = `${point.interface_id || ""}|${point.metric}|${point.details || ""}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(point);
  }

  const rates = [];
  for (const group of grouped.values()) {
    group.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1];
      const current = group[i];
      const seconds = (new Date(current.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
      const delta = Number(current.value) - Number(prev.value);
      if (seconds <= 0 || delta < 0) {
        continue;
      }
      rates.push({
        ...current,
        value: (delta / seconds) * scale,
      });
    }
  }
  return rates;
}

function scaleSeriesValues(points, scale) {
  return points.map((point) => ({
    ...point,
    value: Number(point.value) * scale,
  }));
}

function countProcesses(points) {
  return new Set(points.map((point) => processKey(point)).filter(Boolean)).size;
}

function topProcessCPURows(points) {
  const cpuRates = toRateSeries(points.filter((point) => point.metric === "process_cpu_seconds"), 100);
  const latestCPU = latestBySeries(cpuRates, processKey);
  const latestThreads = latestBySeries(points.filter((point) => point.metric === "process_threads"), processKey);
  return Array.from(latestCPU.values()).map((point) => {
    const details = parseDetails(point.details);
    const threads = latestThreads.get(processKey(point));
    return {
      cpu: Number(point.value),
      name: processName(details),
      pid: details.pid || "-",
      threads: Number(threads?.value),
    };
  }).filter((row) => Number.isFinite(row.cpu)).sort((a, b) => b.cpu - a.cpu);
}

function topProcessMemoryRows(points) {
  const latestRSS = latestBySeries(points.filter((point) => point.metric === "process_memory_rss_bytes"), processKey);
  const latestPct = latestBySeries(points.filter((point) => point.metric === "process_memory_percent"), processKey);
  return Array.from(latestRSS.values()).map((point) => {
    const details = parseDetails(point.details);
    const pct = latestPct.get(processKey(point));
    return {
      memoryPercent: Number(pct?.value),
      name: processName(details),
      pid: details.pid || "-",
      rss: Number(point.value),
    };
  }).filter((row) => Number.isFinite(row.rss)).sort((a, b) => b.rss - a.rss);
}

function topProcessIORows(points) {
  const readRates = latestBySeries(toRateSeries(points.filter((point) => point.metric === "process_io_read_bytes"), 1 / 1024 / 1024), processKey);
  const writeRates = latestBySeries(toRateSeries(points.filter((point) => point.metric === "process_io_write_bytes"), 1 / 1024 / 1024), processKey);
  const keys = new Set([...readRates.keys(), ...writeRates.keys()]);
  return Array.from(keys).map((key) => {
    const readPoint = readRates.get(key);
    const writePoint = writeRates.get(key);
    const source = readPoint || writePoint;
    const details = parseDetails(source?.details);
    const read = Number(readPoint?.value);
    const write = Number(writePoint?.value);
    return {
      name: processName(details),
      pid: details.pid || "-",
      read: Number.isFinite(read) ? read : 0,
      total: (Number.isFinite(read) ? read : 0) + (Number.isFinite(write) ? write : 0),
      write: Number.isFinite(write) ? write : 0,
    };
  }).filter((row) => row.total > 0).sort((a, b) => b.total - a.total);
}

function processKey(point) {
  const details = parseDetails(point.details);
  return details.pid ? `${details.pid}|${details.name || ""}` : "";
}

function processName(details) {
  return details.name || details.exe || `pid ${details.pid || "unknown"}`;
}

function processTable(headers, rows) {
  if (rows.length === 0) {
    return `<p class="empty-state">No process data for selected period</p>`;
  }
  return `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function summarizeSnapshots(samples, interfaceName, network) {
  const ifIndex = selectedInterfaceIndex(network, interfaceName);
  return {
    dns: summarizeDNSSnapshot(samples, interfaceName, ifIndex),
    route: summarizeRouteSnapshot(samples, interfaceName, ifIndex),
    adapter: summarizeAdapterSnapshot(samples, interfaceName, ifIndex),
    wifi: summarizeWiFiSnapshot(samples),
  };
}

function selectedInterfaceIndex(network, interfaceName) {
  const points = filterByInterface(network, interfaceName).filter((point) => point.metric === "interface_up");
  points.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const details = parseDetails(points[0]?.details);
  return Number(details.index);
}

function sameInterface(row, interfaceName, ifIndex) {
  const alias = row.InterfaceAlias || row.Name;
  const index = Number(row.InterfaceIndex ?? row.ifIndex);
  return alias === interfaceName || (Number.isFinite(ifIndex) && index === ifIndex);
}

function summarizeDNSSnapshot(samples, interfaceName, ifIndex) {
  const config = netIPConfigRow(samples, interfaceName, ifIndex);
  const configServers = config?.DNSServers;
  if (Array.isArray(configServers)) {
    return configServers.join(", ");
  }
  if (typeof configServers === "string" && configServers) {
    return configServers;
  }

  const data = snapshotOutput(samples, "dns_snapshot");
  const rows = parseMaybeJSON(data);
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const match = list.find((row) => sameInterface(row, interfaceName, ifIndex));
  const servers = match?.ServerAddresses;
  if (Array.isArray(servers)) {
    return servers.join(", ");
  }
  return typeof servers === "string" ? servers : "";
}

function summarizeRouteSnapshot(samples, interfaceName, ifIndex) {
  const config = netIPConfigRow(samples, interfaceName, ifIndex);
  const gateway = config?.IPv4DefaultGateway;
  if (Array.isArray(gateway)) {
    return gateway.filter(Boolean).join(", ");
  }
  if (typeof gateway === "string" && gateway) {
    return gateway;
  }

  const data = snapshotOutput(samples, "route_snapshot");
  const rows = parseMaybeJSON(data);
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const defaults = list.filter((row) => sameInterface(row, interfaceName, ifIndex) && row.DestinationPrefix === "0.0.0.0/0");
  if (defaults.length === 0) {
    return "";
  }
  return defaults.map((row) => `${row.NextHop} metric ${row.RouteMetric}`).join(", ");
}

function summarizeAdapterSnapshot(samples, interfaceName, ifIndex) {
  const data = snapshotOutput(samples, "adapter_snapshot");
  const rows = parseMaybeJSON(data);
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const match = list.find((row) => sameInterface(row, interfaceName, ifIndex));
  if (!match) {
    return "";
  }
  return `${match.Status || "unknown"} ${match.LinkSpeed || ""}`.trim();
}

function netIPConfigRow(samples, interfaceName, ifIndex) {
  const data = snapshotOutput(samples, "netipconfig_snapshot");
  const rows = parseMaybeJSON(data);
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  return list.find((row) => sameInterface(row, interfaceName, ifIndex));
}

function summarizeWiFiSnapshot(samples) {
  const output = snapshotOutput(samples, "wifi_snapshot");
  if (!output) {
    return "";
  }
  const ssid = /SSID\s+:\s+(.+)/i.exec(output)?.[1]?.trim();
  const signal = /Signal\s+:\s+(.+)/i.exec(output)?.[1]?.trim();
  const radio = /Radio type\s+:\s+(.+)/i.exec(output)?.[1]?.trim();
  return [ssid, signal, radio].filter(Boolean).join(" | ");
}

function snapshotOutput(samples, metric) {
  const sample = samples.find((item) => item.metric === metric);
  const details = parseDetails(sample?.details);
  return details.output || "";
}

function parseMaybeJSON(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function metricRow(label, value) {
  return `<div class="metric-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "-")}</strong></div>`;
}

function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(value / 1024).toFixed(1)} KB`;
}

function formatRate(value, unit) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return `${value.toFixed(1)} ${unit}`;
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : "-";
}

function usageState(value, warn, critical) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (value >= critical) {
    return "critical";
  }
  if (value >= warn) {
    return "warning";
  }
  return "normal";
}

function formatCount(value) {
  return Number.isFinite(value) ? String(Math.round(value)) : "-";
}

function countTargets(points, metric) {
  const targets = new Set(points.filter((p) => p.metric === metric).map((p) => parseDetails(p.details).target).filter(Boolean));
  return targets.size ? String(targets.size) : "-";
}

function successRate(points, metric) {
  const values = points.filter((p) => p.metric === metric).map((p) => Number(p.value)).filter(Number.isFinite);
  if (values.length === 0) {
    return "-";
  }
  const ok = values.filter((value) => value >= 0.5).length;
  return `${Math.round((ok / values.length) * 100)}%`;
}

function jitter(points, metric) {
  const values = points.filter((p) => p.metric === metric).map((p) => Number(p.value)).filter(Number.isFinite);
  if (values.length < 2) {
    return NaN;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : "-";
}

function trafficLabel(point) {
  return point.metric === "bytes_recv" ? "RX" : point.metric === "bytes_sent" ? "TX" : point.metric;
}

function httpBreakdownLabel(point) {
  const details = parseDetails(point.details);
  const target = hostLabel(details.target);
  const labels = {
    http_tcp_ms: "TCP",
    http_tls_ms: "TLS",
    http_ttfb_ms: "TTFB",
    http_total_ms: "Total",
  };
  return `${labels[point.metric] || point.metric} -> ${target}`;
}

function hostLabel(target) {
  if (!target) {
    return "target";
  }
  try {
    return new URL(target).host;
  } catch {
    return target;
  }
}

function filterByMetric(points, metric) {
  return points.filter((point) => point.metric === metric);
}

function filterByInterface(points, interfaceID) {
  if (!interfaceID) {
    return points;
  }
  return points.filter((point) => point.interface_id === interfaceID);
}

function buildInterfaceSummaries(interfacePoints, allNetworkPoints) {
  const byName = new Map();

  for (const point of interfacePoints) {
    const name = point.interface_id || "unknown";
    const current = byName.get(name);
    if (!current || new Date(point.timestamp).getTime() > current.timestamp) {
      const details = parseDetails(point.details);
      byName.set(name, {
        name,
        up: Number(point.value) >= 0.5,
        timestamp: new Date(point.timestamp).getTime(),
        addresses: Array.isArray(details.addresses) ? details.addresses : [],
        targets: new Set(),
      });
    }
  }

  for (const point of allNetworkPoints) {
    if (point.metric !== "tcp_connect_ms" && point.metric !== "dns_query_ms" && point.metric !== "http_request_ms") {
      continue;
    }
    const name = point.interface_id || "unknown";
    const item = byName.get(name);
    if (!item) {
      continue;
    }
    const details = parseDetails(point.details);
    if (details.target) {
      item.targets.add(details.target);
    }
  }

  return Array.from(byName.values())
    .map((item) => ({ ...item, targets: Array.from(item.targets).sort() }))
    .sort((a, b) => Number(b.up) - Number(a.up) || a.name.localeCompare(b.name));
}

function renderInterfaceSelector(interfaces) {
  if (interfaces.length === 0) {
    selectedInterface = "";
    els.interfaceSelect.innerHTML = `<option value="">No interfaces</option>`;
    els.interfaceList.innerHTML = "";
    return;
  }

  if (!interfaces.some((item) => item.name === selectedInterface)) {
    selectedInterface = (interfaces.find((item) => item.up) || interfaces[0]).name;
  }

  els.interfaceSelect.innerHTML = interfaces.map((item) => `
    <option value="${escapeHtml(item.name)}" ${item.name === selectedInterface ? "selected" : ""}>
      ${escapeHtml(item.up ? "up" : "down")} - ${escapeHtml(item.name)}
    </option>
  `).join("");

  els.interfaceList.innerHTML = interfaces.map((item) => `
    <button class="interface-item ${item.name === selectedInterface ? "active" : ""}" type="button" data-interface="${escapeHtml(item.name)}">
      <span class="interface-title">
        <span class="status-dot ${item.up ? "up" : "down"}"></span>
        <span class="interface-name">${escapeHtml(item.name)}</span>
      </span>
      <span class="interface-meta">${escapeHtml(interfaceMeta(item))}</span>
    </button>
  `).join("");

  for (const button of els.interfaceList.querySelectorAll("[data-interface]")) {
    button.addEventListener("click", () => {
      selectedInterface = button.dataset.interface;
      loadCharts();
    });
  }
}

function interfaceMeta(item) {
  const parts = [];
  if (item.addresses.length > 0) {
    parts.push(item.addresses.slice(0, 2).join(", "));
  }
  if (item.targets.length > 0) {
    parts.push(item.targets.join(", "));
  }
  return parts.join(" | ") || "no recent probe details";
}

function groupSeries(points, labelFor) {
  const grouped = new Map();
  for (const point of points) {
    const label = labelFor(point);
    if (!grouped.has(label)) {
      grouped.set(label, []);
    }
    grouped.get(label).push({
      time: new Date(point.timestamp).getTime(),
      value: Number(point.value),
    });
  }
  return Array.from(grouped, ([label, values], index) => ({
    label,
    color: colors[index % colors.length],
    values,
  }));
}

function metricLabel(metric) {
  return {
    cpu_total: "CPU",
    cpu_core_usage: "CPU core",
    memory_used: "RAM",
    memory_used_bytes: "Used",
    memory_available_bytes: "Available",
    memory_total_bytes: "Total",
    disk_c_used: "Disk C:",
    disk_io_read_bytes: "Read",
    disk_io_write_bytes: "Write",
    gpu_utilization: "GPU",
    gpu_engine_utilization: "GPU engine",
    gpu_dedicated_bytes: "Dedicated",
    gpu_shared_bytes: "Shared",
    gateway_ping_ms: "Gateway",
    tcp_connect_ms: "TCP",
    dns_query_ms: "DNS",
    http_request_ms: "HTTP",
    gateway_ping_success: "Gateway",
    tcp_connect_success: "TCP",
    dns_query_success: "DNS",
    http_request_success: "HTTP",
    }[metric] || metric;
}

function systemSeriesLabel(point) {
  if (point.metric === "cpu_core_usage") {
    return `Core ${parseDetails(point.details).core}`;
  }
  if (point.metric === "disk_io_read_bytes" || point.metric === "disk_io_write_bytes") {
    const disk = parseDetails(point.details).disk;
    return `${metricLabel(point.metric)}${disk ? ` ${disk}` : ""}`;
  }
  if (point.metric === "gpu_engine_utilization") {
    return `GPU ${formatEngineType(parseDetails(point.details).engine_type)}`;
  }
  return metricLabel(point.metric);
}

function normalizeEngineType(value) {
  return String(value || "unknown").toLowerCase();
}

function formatEngineType(value) {
  const normalized = normalizeEngineType(value);
  return {
    "3d": "3D",
    compute: "Compute",
    copy: "Copy",
    videodecode: "Video decode",
    videoencode: "Video encode",
    video: "Video",
  }[normalized] || normalized;
}

function latencyLabel(point) {
  const details = parseDetails(point.details);
  const target = details.target || point.metric;
  if (selectedInterface) {
    return target;
  }
  return `${point.interface_id || "unknown"} -> ${target}`;
}

function anomalyNetworkLabel(point) {
  const details = parseDetails(point.details);
  const iface = point.interface_id || "unknown interface";
  const source = details.source_ip ? ` (${details.source_ip})` : "";
  const target = details.target || details.gateway || point.metric;
  return `${iface}${source} -> ${target}`;
}

function parseDetails(details) {
  if (!details) {
    return {};
  }
  try {
    return JSON.parse(details);
  } catch {
    return {};
  }
}

function drawLineChart(canvas, legend, series, options) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const pad = { left: 42, right: 16, top: 16, bottom: 30 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = chartTheme.background;
  ctx.fillRect(0, 0, width, height);

  const all = series.flatMap((s) => s.values);
  if (all.length === 0) {
    ctx.fillStyle = chartTheme.text;
    ctx.font = "14px Segoe UI, Arial";
    ctx.fillText("Нет данных за выбранный период", pad.left, height / 2);
    legend.innerHTML = "";
    return;
  }

  const minTime = Math.min(...all.map((p) => p.time));
  const maxTime = Math.max(...all.map((p) => p.time));
  const minValue = options.min ?? Math.min(...all.map((p) => p.value));
  const maxValue = options.max ?? Math.max(...all.map((p) => p.value));
  const valueSpan = Math.max(1, maxValue - minValue);
  const timeSpan = Math.max(1, maxTime - minTime);

  drawGrid(ctx, width, height, pad, plotW, plotH, minValue, maxValue, options);

  for (const item of series) {
    ctx.beginPath();
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;

    item.values.forEach((point, index) => {
      const x = pad.left + ((point.time - minTime) / timeSpan) * plotW;
      const y = pad.top + plotH - ((point.value - minValue) / valueSpan) * plotH;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  legend.innerHTML = series.map((item) => `
    <span class="legend-item">
      <span class="legend-swatch" style="background:${item.color}"></span>
      ${escapeHtml(item.label)}
    </span>
  `).join("");
}

function drawGrid(ctx, width, height, pad, plotW, plotH, minValue, maxValue, options, scale) {
  ctx.strokeStyle = chartTheme.grid;
  ctx.fillStyle = chartTheme.text;
  ctx.font = "13px Segoe UI, Arial";
  ctx.lineWidth = 1;

  const ticks = scale?.ticks || Array.from({ length: 5 }, (_, index) => maxValue - ((maxValue - minValue) / 4) * index);
  for (const value of ticks) {
    const y = scale ? scale.valueToY(value) : pad.top + plotH - ((value - minValue) / Math.max(1, maxValue - minValue)) * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    const label = formatAxisValue(value, options);
    ctx.fillText(label, 6, y + 4);
  }

  ctx.strokeStyle = chartTheme.axis;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, height - pad.bottom);
  ctx.lineTo(width - pad.right, height - pad.bottom);
  ctx.stroke();

  if (scale?.mode === "log") {
    ctx.fillStyle = chartTheme.textStrong;
    ctx.font = "12px Segoe UI, Arial";
    ctx.fillText("log scale", width - pad.right - 58, pad.top + 14);
  }
}

function drawInteractiveChart(canvas, legend, series, options) {
  setupChartInteractions(canvas);
  const state = createChartState(canvas, legend, series, options, null);
  chartStates.set(canvas, state);
  renderChart(state);
}

function setupChartInteractions(canvas) {
  if (canvas.dataset.interactive === "true") {
    return;
  }
  canvas.dataset.interactive = "true";

  canvas.addEventListener("mousemove", (event) => {
    const state = chartStates.get(canvas);
    if (!state || state.all.length === 0) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const hover = nearestPoint(state, {
      x: (event.clientX - rect.left) * (state.width / rect.width),
      y: (event.clientY - rect.top) * (state.height / rect.height),
    });
    const next = { ...state, hover };
    chartStates.set(canvas, next);
    renderChart(next);
  });

  canvas.addEventListener("mouseleave", () => {
    const state = chartStates.get(canvas);
    if (!state) {
      return;
    }
    const next = { ...state, hover: null };
    chartStates.set(canvas, next);
    renderChart(next);
  });
}

function createChartState(canvas, legend, series, options, hover) {
  const ctx = canvas.getContext("2d");
  const { width, height } = prepareChartCanvas(canvas, ctx);
  const pad = { left: 64, right: 18, top: 18, bottom: 32 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const all = series.flatMap((s) => s.values);

  let minTime = 0;
  let maxTime = 1;
  let minValue = options.min ?? 0;
  let maxValue = options.max ?? 1;
  if (all.length > 0) {
    minTime = Math.min(...all.map((p) => p.time));
    maxTime = Math.max(...all.map((p) => p.time));
    minValue = options.min ?? Math.min(...all.map((p) => p.value));
    maxValue = options.max ?? Math.max(...all.map((p) => p.value));
  }
  if (options.max === undefined && maxValue > minValue) {
    maxValue += (maxValue - minValue) * 0.08;
  }
  if (options.min === undefined && minValue > 0) {
    minValue = Math.max(0, minValue - (maxValue - minValue) * 0.08);
  }
  if (maxValue === minValue) {
    maxValue = minValue + 1;
  }
  const scale = createValueScale(all.map((point) => point.value), minValue, maxValue, options, pad, plotH);

  return { all, canvas, ctx, height, hover, legend, maxTime, maxValue, minTime, minValue, options, pad, plotH, plotW, scale, series, width };
}

function renderChart(state) {
  const { ctx, width, height, pad, plotW, plotH, minTime, maxTime, options, series, all, hover, legend, scale } = state;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = chartTheme.background;
  ctx.fillRect(0, 0, width, height);

  if (all.length === 0) {
    ctx.fillStyle = chartTheme.text;
    ctx.font = "14px Segoe UI, Arial";
    ctx.fillText("Нет данных за выбранный период", pad.left, height / 2);
    legend.innerHTML = "";
    return;
  }

  const timeSpan = Math.max(1, maxTime - minTime);
  drawGrid(ctx, width, height, pad, plotW, plotH, scale.min, scale.max, options, scale);

  for (const item of series) {
    ctx.beginPath();
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    item.values.forEach((point, index) => {
      const x = pad.left + ((point.time - minTime) / timeSpan) * plotW;
      const y = scale.valueToY(point.value);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else if (options.step) {
        const prev = item.values[index - 1];
        const prevY = scale.valueToY(prev.value);
        ctx.lineTo(x, prevY);
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  if (hover) {
    drawHover(state);
  }
  legend.innerHTML = series.map((item) => legendItem(item, options)).join("");
}

function legendItem(item, options) {
  const stats = seriesStats(item.values);
  return `
    <span class="legend-item" title="${escapeHtml(item.label)}">
      <span class="legend-swatch" style="background:${item.color}"></span>
      <span class="legend-label">${escapeHtml(item.label)}</span>
      <span class="legend-stats">
        <span>last <strong>${escapeHtml(formatChartValue(stats.last, options))}</strong></span>
        <span>avg <strong>${escapeHtml(formatChartValue(stats.avg, options))}</strong></span>
        <span>min <strong>${escapeHtml(formatChartValue(stats.min, options))}</strong></span>
        <span>max <strong>${escapeHtml(formatChartValue(stats.max, options))}</strong></span>
      </span>
    </span>
  `;
}

function seriesStats(values) {
  const nums = values.map((point) => Number(point.value)).filter(Number.isFinite);
  if (nums.length === 0) {
    return { avg: NaN, last: NaN, max: NaN, min: NaN };
  }
  return {
    avg: nums.reduce((sum, value) => sum + value, 0) / nums.length,
    last: nums.at(-1),
    max: Math.max(...nums),
    min: Math.min(...nums),
  };
}

function nearestPoint(state, pointer) {
  const { pad, plotW, minTime, maxTime, series } = state;
  if (pointer.x < pad.left || pointer.x > pad.left + plotW) {
    return null;
  }

  const targetTime = minTime + ((pointer.x - pad.left) / plotW) * (maxTime - minTime);
  let best = null;
  for (const item of series) {
    for (const point of item.values) {
      const distance = Math.abs(point.time - targetTime);
      if (!best || distance < best.distance) {
        best = { distance, item, point };
      }
    }
  }
  return best;
}

function drawHover(state) {
  const { ctx, pad, plotH, plotW, minTime, maxTime, hover, options, width, scale } = state;
  if (!hover) {
    return;
  }

  const timeSpan = Math.max(1, maxTime - minTime);
  const x = pad.left + ((hover.point.time - minTime) / timeSpan) * plotW;
  const y = scale.valueToY(hover.point.value);

  ctx.save();
  ctx.strokeStyle = chartTheme.crosshair;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x, pad.top);
  ctx.lineTo(x, pad.top + plotH);
  ctx.moveTo(pad.left, y);
  ctx.lineTo(pad.left + plotW, y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = hover.item.color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();

  drawTooltip(ctx, [
    hover.item.label,
    `${new Date(hover.point.time).toLocaleString()} | ${formatChartValue(hover.point.value, options)}${scale.mode === "log" ? " | log scale" : ""}`,
  ], x, y, width);
  ctx.restore();
}

function drawTooltip(ctx, lines, x, y, width) {
  ctx.font = "13px Segoe UI, Arial";
  const padding = 10;
  const lineHeight = 19;
  const boxW = Math.max(...lines.map((line) => ctx.measureText(line).width)) + padding * 2;
  const boxH = lines.length * lineHeight + padding * 2;
  let boxX = x + 12;
  if (boxX + boxW > width - 8) {
    boxX = x - boxW - 12;
  }
  const boxY = Math.max(8, y - boxH - 12);

  ctx.fillStyle = chartTheme.tooltip;
  ctx.strokeStyle = chartTheme.tooltipBorder;
  ctx.lineWidth = 1;
  roundRect(ctx, boxX, boxY, boxW, boxH, 6);
  ctx.fill();
  ctx.stroke();

  lines.forEach((line, index) => {
    ctx.fillStyle = index === 0 ? chartTheme.textStrong : chartTheme.text;
    ctx.fillText(line, boxX + padding, boxY + padding + 12 + index * lineHeight);
  });
}

function prepareChartCanvas(canvas, ctx) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width));
  const height = Math.max(220, Math.round(rect.height || canvas.clientHeight || canvas.height));
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { height, width };
}

function createValueScale(values, minValue, maxValue, options, pad, plotH) {
  const finite = values.filter((value) => Number.isFinite(value));
  const positive = finite.filter((value) => value > 0).sort((a, b) => a - b);
  const useLog = options.scale === "log" || (options.scale === "auto-log" && shouldUseLogScale(positive));
  if (!useLog || positive.length === 0) {
    const min = minValue;
    const max = maxValue;
    return {
      max,
      min,
      mode: "linear",
      ticks: Array.from({ length: 5 }, (_, index) => max - ((max - min) / 4) * index),
      valueToY: (value) => pad.top + plotH - ((Math.max(min, Math.min(max, value)) - min) / Math.max(1, max - min)) * plotH,
    };
  }

  const min = Math.max(1, Math.min(...positive) * 0.8);
  const max = Math.max(min * 1.1, maxValue);
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  return {
    max,
    min,
    mode: "log",
    ticks: logTicks(min, max),
    valueToY: (value) => {
      const safe = Math.max(min, Math.min(max, value || min));
      return pad.top + plotH - ((Math.log10(safe) - logMin) / Math.max(0.001, logMax - logMin)) * plotH;
    },
  };
}

function shouldUseLogScale(positive) {
  if (positive.length < 8) {
    return false;
  }
  const p90 = percentile(positive, 0.9);
  const max = positive.at(-1);
  return max >= 200 && p90 > 0 && max / p90 >= 6;
}

function percentile(sorted, ratio) {
  if (sorted.length === 0) {
    return NaN;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function logTicks(min, max) {
  const result = [];
  const start = Math.floor(Math.log10(min));
  const end = Math.ceil(Math.log10(max));
  for (let power = start; power <= end; power++) {
    for (const multiplier of [1, 2, 5]) {
      const value = multiplier * Math.pow(10, power);
      if (value >= min && value <= max) {
        result.push(value);
      }
    }
  }
  if (!result.includes(max)) {
    result.push(max);
  }
  return result.slice(-6).reverse();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function formatChartValue(value, options) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (options.valueFormatter) {
    return options.valueFormatter(value);
  }
  const abs = Math.abs(value);
  const precision = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${value.toFixed(precision)}${options.suffix || ""}`;
}

function formatAxisValue(value, options) {
  if (options.valueFormatter) {
    return options.valueFormatter(value);
  }
  if (!Number.isFinite(value)) {
    return "-";
  }
  const abs = Math.abs(value);
  const precision = abs >= 100 || Number.isInteger(value) ? 0 : abs >= 10 ? 1 : 2;
  return `${value.toFixed(precision)}${options.suffix || ""}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.form.addEventListener("submit", saveSettings);
els.refresh.addEventListener("click", refreshData);
els.timelineWindow.addEventListener("change", () => {
  syncTimelineRangeInputs();
  loadCharts();
});
els.timelineFrom.addEventListener("change", loadCharts);
els.timelineTo.addEventListener("change", loadCharts);
els.showIgnoredAnomalies.addEventListener("change", () => renderAnomalies(currentAnomalies));
els.anomalyList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-anomaly-action]");
  if (!button) {
    return;
  }
  toggleIgnoredAnomaly(button.dataset.anomalyAction, button.dataset.anomalyKey);
});
els.interfaceSelect.addEventListener("change", () => {
  selectedInterface = els.interfaceSelect.value;
  loadCharts();
});
for (const tab of els.tabs) {
  tab.addEventListener("click", () => {
    setActiveTab(tab.dataset.tab);
  });
}

function setActiveTab(name) {
  for (const tab of els.tabs) {
    tab.classList.toggle("active", tab.dataset.tab === name);
  }
  for (const [viewName, view] of Object.entries(els.tabViews)) {
    view.classList.toggle("active", viewName === name);
  }
  loadCharts();
}

syncTimelineRangeInputs();
loadSettings();
refreshData();
setInterval(refreshData, 5000);

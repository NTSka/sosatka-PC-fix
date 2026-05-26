package collectors

import (
	"context"
	"crypto/tls"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptrace"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	gopsnet "github.com/shirou/gopsutil/v4/net"
)

var tcpProbeTargets = []string{
	"1.1.1.1:443",
	"8.8.8.8:443",
}

var dnsProbeTargets = []string{
	"1.1.1.1:53",
	"8.8.8.8:53",
	"77.88.8.8:53",
	"77.88.8.1:53",
}

var httpProbeTargets = []string{
	"https://www.gstatic.com/generate_204",
	"https://ya.ru/",
}

func (a *Agent) collectNetworkStatus(ctx context.Context) {
	now := time.Now().UTC()

	interfaces, err := net.Interfaces()
	if err != nil {
		a.insertError(ctx, now, "network", nil, "interfaces", err)
		return
	}

	counters := networkCountersByName(ctx)
	for _, iface := range interfaces {
		interfaceID := iface.Name
		addrs, _ := iface.Addrs()
		details, _ := json.Marshal(map[string]any{
			"name":          iface.Name,
			"index":         iface.Index,
			"hardware_addr": iface.HardwareAddr.String(),
			"mtu":           iface.MTU,
			"flags":         iface.Flags.String(),
			"addresses":     stringifyAddrs(addrs),
		})

		up := 0.0
		if iface.Flags&net.FlagUp != 0 {
			up = 1
		}

		a.insertValue(ctx, now, "network", &interfaceID, "interface_up", up, "bool", string(details))
		if counter, ok := counters[iface.Name]; ok {
			a.insertValue(ctx, now, "network", &interfaceID, "bytes_sent", float64(counter.BytesSent), "bytes", string(details))
			a.insertValue(ctx, now, "network", &interfaceID, "bytes_recv", float64(counter.BytesRecv), "bytes", string(details))
			a.insertValue(ctx, now, "network", &interfaceID, "packets_sent", float64(counter.PacketsSent), "packets", string(details))
			a.insertValue(ctx, now, "network", &interfaceID, "packets_recv", float64(counter.PacketsRecv), "packets", string(details))
			a.insertValue(ctx, now, "network", &interfaceID, "errin", float64(counter.Errin), "packets", string(details))
			a.insertValue(ctx, now, "network", &interfaceID, "errout", float64(counter.Errout), "packets", string(details))
			a.insertValue(ctx, now, "network", &interfaceID, "dropin", float64(counter.Dropin), "packets", string(details))
			a.insertValue(ctx, now, "network", &interfaceID, "dropout", float64(counter.Dropout), "packets", string(details))
		}
	}
}

func (a *Agent) collectNetworkProbes(ctx context.Context) {
	now := time.Now().UTC()

	interfaces, err := net.Interfaces()
	if err != nil {
		a.insertError(ctx, now, "network", nil, "interfaces", err)
		return
	}

	a.collectActiveNetworkProbes(ctx, now, interfaces)
}

func stringifyAddrs(addrs []net.Addr) []string {
	values := make([]string, 0, len(addrs))
	for _, addr := range addrs {
		values = append(values, addr.String())
	}
	return values
}

func networkCountersByName(ctx context.Context) map[string]gopsnet.IOCountersStat {
	counters, err := gopsnet.IOCountersWithContext(ctx, true)
	if err != nil {
		return nil
	}

	byName := make(map[string]gopsnet.IOCountersStat, len(counters))
	for _, counter := range counters {
		byName[counter.Name] = counter
	}
	return byName
}

func (a *Agent) collectActiveNetworkProbes(ctx context.Context, now time.Time, interfaces []net.Interface) {
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)
	gateways := defaultGatewaysByInterface(ctx, interfaces)
	interfaceDNS := dnsServersByInterface(ctx, interfaces)

	for _, iface := range interfaces {
		if !shouldProbeInterface(iface) {
			continue
		}

		sourceIPs := interfaceIPv4Addrs(iface)
		for _, sourceIP := range sourceIPs {
			if gateway := gateways[iface.Name]; gateway != "" {
				wg.Add(1)
				go func(iface net.Interface, sourceIP net.IP, gateway string) {
					defer wg.Done()
					sem <- struct{}{}
					defer func() { <-sem }()
					a.collectGatewayProbe(ctx, now, iface.Name, sourceIP, gateway)
				}(iface, sourceIP, gateway)
			}

			for _, target := range tcpProbeTargets {
				wg.Add(1)
				go func(iface net.Interface, sourceIP net.IP, target string) {
					defer wg.Done()
					sem <- struct{}{}
					defer func() { <-sem }()
					a.collectTCPProbe(ctx, now, iface.Name, sourceIP, target)
				}(iface, sourceIP, target)
			}

			for _, target := range dnsProbeTargets {
				wg.Add(1)
				go func(iface net.Interface, sourceIP net.IP, target string) {
					defer wg.Done()
					sem <- struct{}{}
					defer func() { <-sem }()
					a.collectDNSProbe(ctx, now, iface.Name, sourceIP, target, "dns_query")
				}(iface, sourceIP, target)
			}

			for _, server := range interfaceDNS[iface.Name] {
				target := net.JoinHostPort(server, "53")
				wg.Add(1)
				go func(iface net.Interface, sourceIP net.IP, target string) {
					defer wg.Done()
					sem <- struct{}{}
					defer func() { <-sem }()
					a.collectDNSProbe(ctx, now, iface.Name, sourceIP, target, "interface_dns_query")
				}(iface, sourceIP, target)
			}

			for _, target := range httpProbeTargets {
				wg.Add(1)
				go func(iface net.Interface, sourceIP net.IP, target string) {
					defer wg.Done()
					sem <- struct{}{}
					defer func() { <-sem }()
					a.collectHTTPProbe(ctx, now, iface.Name, sourceIP, target)
				}(iface, sourceIP, target)
			}
		}
	}

	wg.Wait()
}

func defaultGatewaysByInterface(ctx context.Context, interfaces []net.Interface) map[string]string {
	rows := powershellJSONRows(ctx, "Get-NetIPConfiguration | Select-Object InterfaceAlias,InterfaceIndex,@{Name='IPv4DefaultGateway';Expression={$_.IPv4DefaultGateway.NextHop}} | ConvertTo-Json -Compress")
	gateways := make(map[string]string)
	namesByIndex := interfaceNamesByIndex(interfaces)
	for _, row := range rows {
		alias, _ := row["InterfaceAlias"].(string)
		if name := namesByIndex[intFromAny(row["InterfaceIndex"])]; name != "" {
			alias = name
		}
		nextHop, _ := row["IPv4DefaultGateway"].(string)
		if alias == "" || nextHop == "" || nextHop == "0.0.0.0" {
			continue
		}
		if _, exists := gateways[alias]; !exists {
			gateways[alias] = nextHop
		}
	}
	return gateways
}

func dnsServersByInterface(ctx context.Context, interfaces []net.Interface) map[string][]string {
	rows := powershellJSONRows(ctx, "Get-NetIPConfiguration | Select-Object InterfaceAlias,InterfaceIndex,@{Name='DNSServers';Expression={$_.DNSServer.ServerAddresses}} | ConvertTo-Json -Compress")
	servers := make(map[string][]string)
	namesByIndex := interfaceNamesByIndex(interfaces)
	for _, row := range rows {
		alias, _ := row["InterfaceAlias"].(string)
		if name := namesByIndex[intFromAny(row["InterfaceIndex"])]; name != "" {
			alias = name
		}
		if alias == "" {
			continue
		}
		switch typed := row["DNSServers"].(type) {
		case []any:
			for _, value := range typed {
				if server, ok := value.(string); ok && server != "" {
					servers[alias] = append(servers[alias], server)
				}
			}
		case string:
			if typed != "" {
				servers[alias] = append(servers[alias], typed)
			}
		}
	}
	return servers
}

func interfaceNamesByIndex(interfaces []net.Interface) map[int]string {
	names := make(map[int]string, len(interfaces))
	for _, iface := range interfaces {
		names[iface.Index] = iface.Name
	}
	return names
}

func intFromAny(value any) int {
	switch typed := value.(type) {
	case float64:
		return int(typed)
	case int:
		return typed
	case string:
		parsed, _ := strconv.Atoi(typed)
		return parsed
	default:
		return 0
	}
}

func powershellJSONRows(ctx context.Context, command string) []map[string]any {
	return powershellJSONRowsWithTimeout(ctx, command, 3*time.Second)
}

func powershellJSONRowsWithTimeout(ctx context.Context, command string, timeout time.Duration) []map[string]any {
	commandCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	out, err := hiddenCommandContext(commandCtx, "powershell.exe", "-NoProfile", "-Command", command).Output()
	if err != nil || len(out) == 0 {
		return nil
	}

	var list []map[string]any
	if err := json.Unmarshal(out, &list); err == nil {
		return list
	}

	var single map[string]any
	if err := json.Unmarshal(out, &single); err == nil {
		return []map[string]any{single}
	}
	return nil
}

func (a *Agent) collectNetworkSnapshot(ctx context.Context) {
	now := time.Now().UTC()
	a.collectCommandSnapshot(ctx, now, "netipconfig_snapshot", "powershell.exe", "-NoProfile", "-Command", "Get-NetIPConfiguration | Select-Object InterfaceAlias,InterfaceIndex,NetProfile,@{Name='IPv4Address';Expression={$_.IPv4Address.IPAddress}},@{Name='IPv4DefaultGateway';Expression={$_.IPv4DefaultGateway.NextHop}},@{Name='DNSServers';Expression={$_.DNSServer.ServerAddresses}} | ConvertTo-Json -Compress")
	a.collectCommandSnapshot(ctx, now, "route_snapshot", "powershell.exe", "-NoProfile", "-Command", "Get-NetRoute -AddressFamily IPv4 | Select-Object DestinationPrefix,NextHop,InterfaceAlias,RouteMetric,InterfaceMetric,ifIndex | ConvertTo-Json -Compress")
	a.collectCommandSnapshot(ctx, now, "dns_snapshot", "powershell.exe", "-NoProfile", "-Command", "Get-DnsClientServerAddress -AddressFamily IPv4 | Select-Object InterfaceAlias,InterfaceIndex,ServerAddresses | ConvertTo-Json -Compress")
	a.collectCommandSnapshot(ctx, now, "adapter_snapshot", "powershell.exe", "-NoProfile", "-Command", "Get-NetAdapter | Select-Object Name,InterfaceDescription,Status,LinkSpeed,MacAddress,ifIndex | ConvertTo-Json -Compress")
	a.collectCommandSnapshot(ctx, now, "wifi_snapshot", "netsh.exe", "wlan", "show", "interfaces")
}

func (a *Agent) collectCommandSnapshot(ctx context.Context, ts time.Time, metric string, name string, args ...string) {
	commandCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	out, err := hiddenCommandContext(commandCtx, name, args...).CombinedOutput()
	details, _ := json.Marshal(map[string]any{
		"command": append([]string{name}, args...),
		"output":  strings.TrimSpace(string(out)),
	})
	if err != nil {
		a.insertErrorWithDetails(ctx, ts, "network_snapshot", nil, metric, err, string(details))
		return
	}
	if commandCtx.Err() != nil {
		a.insertErrorWithDetails(ctx, ts, "network_snapshot", nil, metric, commandCtx.Err(), string(details))
		return
	}
	a.insertSampleDetails(ctx, ts, "network_snapshot", nil, metric, string(details))
}

func shouldProbeInterface(iface net.Interface) bool {
	if iface.Flags&net.FlagUp == 0 {
		return false
	}
	if iface.Flags&net.FlagLoopback != 0 {
		return false
	}
	if iface.Flags&net.FlagRunning == 0 {
		return false
	}
	return true
}

func interfaceIPv4Addrs(iface net.Interface) []net.IP {
	addrs, err := iface.Addrs()
	if err != nil {
		return nil
	}

	var ips []net.IP
	for _, addr := range addrs {
		var ip net.IP
		switch typed := addr.(type) {
		case *net.IPNet:
			ip = typed.IP
		case *net.IPAddr:
			ip = typed.IP
		}

		ip = ip.To4()
		if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
			continue
		}
		ips = append(ips, ip)
	}
	return ips
}

func (a *Agent) collectTCPProbe(ctx context.Context, ts time.Time, interfaceID string, sourceIP net.IP, target string) {
	probeCtx, cancel := context.WithTimeout(ctx, 1200*time.Millisecond)
	defer cancel()

	start := time.Now()
	dialer := net.Dialer{
		Timeout:   1200 * time.Millisecond,
		LocalAddr: &net.TCPAddr{IP: sourceIP},
	}
	conn, err := dialer.DialContext(probeCtx, "tcp", target)
	latency := float64(time.Since(start).Microseconds()) / 1000
	details := probeDetails(sourceIP, target, "tcp_connect")
	if err != nil {
		a.insertValue(ctx, ts, "network", &interfaceID, "tcp_connect_success", 0, "bool", details)
		a.insertProbeError(ctx, ts, interfaceID, "tcp_connect_ms", err, details)
		return
	}
	_ = conn.Close()

	a.insertValue(ctx, ts, "network", &interfaceID, "tcp_connect_success", 1, "bool", details)
	a.insertValue(ctx, ts, "network", &interfaceID, "tcp_connect_ms", latency, "ms", details)
}

func (a *Agent) collectGatewayProbe(ctx context.Context, ts time.Time, interfaceID string, sourceIP net.IP, gateway string) {
	probeCtx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	defer cancel()

	start := time.Now()
	out, err := hiddenCommandContext(probeCtx, "ping.exe", "-n", "1", "-w", "1000", "-S", sourceIP.String(), gateway).CombinedOutput()
	latency := float64(time.Since(start).Microseconds()) / 1000
	details := probeDetails(sourceIP, gateway, "gateway_ping")
	if err != nil {
		a.insertValue(ctx, ts, "network", &interfaceID, "gateway_ping_success", 0, "bool", details)
		a.insertProbeError(ctx, ts, interfaceID, "gateway_ping_ms", err, details)
		return
	}

	if parsed, ok := parsePingLatency(string(out)); ok {
		latency = parsed
	}
	a.insertValue(ctx, ts, "network", &interfaceID, "gateway_ping_success", 1, "bool", details)
	a.insertValue(ctx, ts, "network", &interfaceID, "gateway_ping_ms", latency, "ms", details)
}

func parsePingLatency(output string) (float64, bool) {
	re := regexp.MustCompile(`(?i)(?:time|время)\s*[=<]\s*(\d+)`)
	match := re.FindStringSubmatch(output)
	if len(match) < 2 {
		return 0, false
	}
	value, err := strconv.ParseFloat(match[1], 64)
	if err != nil {
		return 0, false
	}
	return value, true
}

func (a *Agent) collectDNSProbe(ctx context.Context, ts time.Time, interfaceID string, sourceIP net.IP, target string, probeType string) {
	probeCtx, cancel := context.WithTimeout(ctx, 1200*time.Millisecond)
	defer cancel()

	start := time.Now()
	dialer := net.Dialer{
		Timeout:   1200 * time.Millisecond,
		LocalAddr: &net.UDPAddr{IP: sourceIP},
	}
	conn, err := dialer.DialContext(probeCtx, "udp", target)
	if err != nil {
		details := probeDetails(sourceIP, target, probeType)
		a.insertValue(ctx, ts, "network", &interfaceID, "dns_query_success", 0, "bool", details)
		a.insertProbeError(ctx, ts, interfaceID, "dns_query_ms", err, details)
		return
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(1200 * time.Millisecond))
	queryID := uint16(time.Now().UnixNano())
	if _, err := conn.Write(buildDNSQuery(queryID, "example.com")); err != nil {
		details := probeDetails(sourceIP, target, probeType)
		a.insertValue(ctx, ts, "network", &interfaceID, "dns_query_success", 0, "bool", details)
		a.insertProbeError(ctx, ts, interfaceID, "dns_query_ms", err, details)
		return
	}

	response := make([]byte, 512)
	n, err := conn.Read(response)
	latency := float64(time.Since(start).Microseconds()) / 1000
	details := probeDetails(sourceIP, target, probeType)
	if err != nil {
		a.insertValue(ctx, ts, "network", &interfaceID, "dns_query_success", 0, "bool", details)
		a.insertProbeError(ctx, ts, interfaceID, "dns_query_ms", err, details)
		return
	}
	if err := validateDNSResponse(response[:n], queryID); err != nil {
		a.insertValue(ctx, ts, "network", &interfaceID, "dns_query_success", 0, "bool", details)
		a.insertProbeError(ctx, ts, interfaceID, "dns_query_ms", err, details)
		return
	}

	a.insertValue(ctx, ts, "network", &interfaceID, "dns_query_success", 1, "bool", details)
	a.insertValue(ctx, ts, "network", &interfaceID, "dns_query_ms", latency, "ms", details)
}

func (a *Agent) collectHTTPProbe(ctx context.Context, ts time.Time, interfaceID string, sourceIP net.IP, target string) {
	probeCtx, cancel := context.WithTimeout(ctx, 2500*time.Millisecond)
	defer cancel()

	dialer := &net.Dialer{
		Timeout:   1500 * time.Millisecond,
		LocalAddr: &net.TCPAddr{IP: sourceIP},
	}
	var connectStart, connectDone, tlsStart, tlsDone, firstByte time.Time
	client := &http.Client{
		Timeout: 2500 * time.Millisecond,
		Transport: &http.Transport{
			Proxy:                 nil,
			DialContext:           dialer.DialContext,
			TLSHandshakeTimeout:   1500 * time.Millisecond,
			ResponseHeaderTimeout: 1500 * time.Millisecond,
			DisableKeepAlives:     true,
		},
	}

	req, err := http.NewRequestWithContext(probeCtx, http.MethodGet, target, nil)
	details := probeDetails(sourceIP, target, "http_request")
	if err != nil {
		a.insertValue(ctx, ts, "network", &interfaceID, "http_request_success", 0, "bool", details)
		a.insertProbeError(ctx, ts, interfaceID, "http_request_ms", err, details)
		return
	}
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("User-Agent", "pc-debug/0.1")

	start := time.Now()
	trace := &httptrace.ClientTrace{
		ConnectStart: func(_, _ string) {
			connectStart = time.Now()
		},
		ConnectDone: func(_, _ string, _ error) {
			connectDone = time.Now()
		},
		TLSHandshakeStart: func() {
			tlsStart = time.Now()
		},
		TLSHandshakeDone: func(_ tls.ConnectionState, _ error) {
			tlsDone = time.Now()
		},
		GotFirstResponseByte: func() {
			firstByte = time.Now()
		},
	}
	req = req.WithContext(httptrace.WithClientTrace(req.Context(), trace))
	resp, err := client.Do(req)
	latency := float64(time.Since(start).Microseconds()) / 1000
	if err != nil {
		a.insertValue(ctx, ts, "network", &interfaceID, "http_request_success", 0, "bool", details)
		a.insertProbeError(ctx, ts, interfaceID, "http_request_ms", err, details)
		return
	}
	_ = resp.Body.Close()
	details = probeDetailsWithExtra(sourceIP, target, "http_request", map[string]any{
		"status_code": resp.StatusCode,
	})

	if resp.StatusCode >= 500 {
		a.insertValue(ctx, ts, "network", &interfaceID, "http_request_success", 0, "bool", details)
		a.insertProbeError(ctx, ts, interfaceID, "http_request_ms", fmt.Errorf("HTTP status %d", resp.StatusCode), details)
		return
	}

	a.insertValue(ctx, ts, "network", &interfaceID, "http_request_success", 1, "bool", details)
	a.insertValue(ctx, ts, "network", &interfaceID, "http_request_ms", latency, "ms", details)
	a.insertValue(ctx, ts, "network", &interfaceID, "http_total_ms", latency, "ms", details)
	if !connectStart.IsZero() && !connectDone.IsZero() {
		a.insertValue(ctx, ts, "network", &interfaceID, "http_tcp_ms", float64(connectDone.Sub(connectStart).Microseconds())/1000, "ms", details)
	}
	if !tlsStart.IsZero() && !tlsDone.IsZero() {
		a.insertValue(ctx, ts, "network", &interfaceID, "http_tls_ms", float64(tlsDone.Sub(tlsStart).Microseconds())/1000, "ms", details)
	}
	if !firstByte.IsZero() {
		a.insertValue(ctx, ts, "network", &interfaceID, "http_ttfb_ms", float64(firstByte.Sub(start).Microseconds())/1000, "ms", details)
	}
}

func probeDetails(sourceIP net.IP, target string, probeType string) string {
	return probeDetailsWithExtra(sourceIP, target, probeType, nil)
}

func probeDetailsWithExtra(sourceIP net.IP, target string, probeType string, extra map[string]any) string {
	values := map[string]any{
		"probe_type": probeType,
		"source_ip":  sourceIP.String(),
		"target":     target,
	}
	for key, value := range extra {
		values[key] = value
	}
	details, _ := json.Marshal(map[string]any{
		"probe_type":  values["probe_type"],
		"source_ip":   values["source_ip"],
		"target":      values["target"],
		"status_code": values["status_code"],
	})
	return string(details)
}

func (a *Agent) insertProbeError(ctx context.Context, ts time.Time, interfaceID string, metric string, err error, details string) {
	if strings.TrimSpace(details) == "" {
		details = "{}"
	}
	a.insertErrorWithDetails(ctx, ts, "network", &interfaceID, metric, err, details)
}

func buildDNSQuery(id uint16, name string) []byte {
	query := make([]byte, 12, 512)
	binary.BigEndian.PutUint16(query[0:2], id)
	binary.BigEndian.PutUint16(query[2:4], 0x0100)
	binary.BigEndian.PutUint16(query[4:6], 1)

	for _, label := range strings.Split(name, ".") {
		query = append(query, byte(len(label)))
		query = append(query, []byte(label)...)
	}
	query = append(query, 0)
	query = binary.BigEndian.AppendUint16(query, 1)
	query = binary.BigEndian.AppendUint16(query, 1)
	return query
}

func validateDNSResponse(response []byte, queryID uint16) error {
	if len(response) < 12 {
		return errors.New("short DNS response")
	}
	if binary.BigEndian.Uint16(response[0:2]) != queryID {
		return errors.New("DNS response ID mismatch")
	}
	flags := binary.BigEndian.Uint16(response[2:4])
	if flags&0x8000 == 0 {
		return errors.New("DNS response is not marked as response")
	}
	rcode := flags & 0x000f
	if rcode != 0 {
		return fmt.Errorf("DNS rcode %d", rcode)
	}
	if binary.BigEndian.Uint16(response[6:8]) == 0 {
		return errors.New("DNS response has no answers")
	}
	return nil
}

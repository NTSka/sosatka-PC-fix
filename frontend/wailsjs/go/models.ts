export namespace config {
	
	export class Settings {
	    system_interval_seconds: number;
	    network_interval_seconds?: number;
	    network_status_interval_seconds: number;
	    network_probe_interval_seconds: number;
	    network_snapshot_interval_seconds: number;
	    process_interval_seconds: number;
	    collect_system: boolean;
	    collect_network: boolean;
	    collect_processes: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.system_interval_seconds = source["system_interval_seconds"];
	        this.network_interval_seconds = source["network_interval_seconds"];
	        this.network_status_interval_seconds = source["network_status_interval_seconds"];
	        this.network_probe_interval_seconds = source["network_probe_interval_seconds"];
	        this.network_snapshot_interval_seconds = source["network_snapshot_interval_seconds"];
	        this.process_interval_seconds = source["process_interval_seconds"];
	        this.collect_system = source["collect_system"];
	        this.collect_network = source["collect_network"];
	        this.collect_processes = source["collect_processes"];
	    }
	}

}

export namespace storage {
	
	export class Sample {
	    id: number;
	    // Go type: time
	    timestamp: any;
	    kind: string;
	    interface_id?: string;
	    metric: string;
	    value?: number;
	    unit?: string;
	    error?: string;
	    details?: string;
	    // Go type: time
	    created_at: any;
	
	    static createFrom(source: any = {}) {
	        return new Sample(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.timestamp = this.convertValues(source["timestamp"], null);
	        this.kind = source["kind"];
	        this.interface_id = source["interface_id"];
	        this.metric = source["metric"];
	        this.value = source["value"];
	        this.unit = source["unit"];
	        this.error = source["error"];
	        this.details = source["details"];
	        this.created_at = this.convertValues(source["created_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SeriesPoint {
	    // Go type: time
	    timestamp: any;
	    kind: string;
	    interface_id?: string;
	    metric: string;
	    value: number;
	    unit?: string;
	    details?: string;
	
	    static createFrom(source: any = {}) {
	        return new SeriesPoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = this.convertValues(source["timestamp"], null);
	        this.kind = source["kind"];
	        this.interface_id = source["interface_id"];
	        this.metric = source["metric"];
	        this.value = source["value"];
	        this.unit = source["unit"];
	        this.details = source["details"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}


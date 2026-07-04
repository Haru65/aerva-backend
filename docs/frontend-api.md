# Aerva Frontend API Guide

Base URL:

```js
const API_BASE = "http://localhost:3000";
```

## Dashboard Latest

Use this endpoint for the initial dashboard load.

```http
GET /api/dashboard/
```

Example:

```js
export async function fetchLatestDashboard() {
  const res = await fetch(`${API_BASE}/api/dashboard/`);

  if (!res.ok) {
    throw new Error("Failed to fetch dashboard data");
  }

  return res.json();
}
```

Response shape:

```js
{
  id: 1,
  device_mac: "EC64C96EDA3C",
  received_at: "2026-07-04T00:00:00.000Z",
  readings: {
    temperature: 30,
    humidity: 60,
    co_ppm: 1,
    o2_pct: 20.9,
    co2_ppm: 500,
    pm1_0: 10,
    pm2_5: 20,
    pm10: 30,
    rssi: -60
  },
  status: {
    o2_warn: false,
    time_status: "OK",
    mqtt_err: 0
  }
}
```

## Live Dashboard Updates

The HTTP API returns data once. For live updates, connect with Socket.IO.

Install:

```bash
npm install socket.io-client
```

Event name:

```js
"/api/dashboard/"
```

React hook example:

```js
import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const API_BASE = "http://localhost:3000";

export function useDashboardData() {
  const [dashboardData, setDashboardData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let socket;

    async function loadInitialData() {
      const res = await fetch(`${API_BASE}/api/dashboard/`);
      const data = await res.json();
      setDashboardData(data);
    }

    loadInitialData();

    socket = io(API_BASE);

    socket.on("connect", () => {
      setIsConnected(true);
      console.log("Socket connected:", socket.id);
    });

    socket.on("/api/dashboard/", (data) => {
      setDashboardData(data);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      console.log("Socket disconnected");
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { dashboardData, isConnected };
}
```

Usage:

```js
const { dashboardData, isConnected } = useDashboardData();
```

## Graph Data

Use this endpoint for chart points over a selected range.

```http
GET /api/dashboard/graph?device_mac=EC64C96EDA3C&metric=temperature&range=24h
```

Allowed ranges:

```js
["1h", "24h", "7d", "30d"]
```

Allowed metrics:

```js
[
  "temperature",
  "humidity",
  "co_ppm",
  "o2_pct",
  "co2_ppm",
  "pm1_0",
  "pm2_5",
  "pm10",
  "rssi"
]
```

Example:

```js
export async function fetchGraphData({ deviceMac, metric, range }) {
  const params = new URLSearchParams({
    device_mac: deviceMac,
    metric,
    range
  });

  const res = await fetch(`${API_BASE}/api/dashboard/graph?${params}`);

  if (!res.ok) {
    throw new Error("Failed to fetch graph data");
  }

  return res.json();
}
```

Expected response:

```js
{
  device_mac: "EC64C96EDA3C",
  metric: "temperature",
  range: "24h",
  points: [
    {
      time: "2026-07-04T00:00:00.000Z",
      value: 30
    }
  ]
}
```

## Report Downloads

Excel report:

```http
GET /api/reports/export?device_mac=EC64C96EDA3C&range=7d
```

Browser download:

```js
export function downloadExcelReport(deviceMac, range) {
  const params = new URLSearchParams({
    device_mac: deviceMac,
    range
  });

  window.location.href = `${API_BASE}/api/reports/export?${params}`;
}
```

PDF report, if enabled:

```http
GET /api/reports/export-pdf?device_mac=EC64C96EDA3C&range=7d
```

```js
export function downloadPdfReport(deviceMac, range) {
  const params = new URLSearchParams({
    device_mac: deviceMac,
    range
  });

  window.location.href = `${API_BASE}/api/reports/export-pdf?${params}`;
}
```

## Notes

- Use `GET /api/dashboard/` only for the initial dashboard value.
- Use Socket.IO event `"/api/dashboard/"` for live updates.
- New live data is emitted only after MQTT data is received and saved by the backend.
- Restart the backend after changing Socket.IO or MQTT code.

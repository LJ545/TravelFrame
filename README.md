# TravelFrame — Self-Hosted
<p align="center">
  <img width="600" alt="20260620_123322_developed" src="https://github.com/user-attachments/assets/3295c381-45fd-4a1f-9136-0ccfedfb8f05" />
</p>
A self-hosted companion server for a **TravelFrame** e-ink client display.

The web app lets you mark visited countries and states on an 800×480 world map, set a next destination with countdown, and push the result as a BMP to a physical e-ink frame. The frame polls the server every 30 seconds and refreshes only when the image changes.

---

## Architecture

```
Browser (React SPA)
  └─ edits map, sends BMP → Fastify server
                               ├─ stores state + image per device
                               └─ hourly re-renders BMP with live weather + ETD
                                        ↑ polls every 30 s
                               ESP32 + e-ink display
```

---

## Requirements

- **Node.js** 20 or later
- **npm** 10 or later

---

## Getting started

### 1. Install dependencies

```bash
cd webapp
npm install
```

### 2. Build everything

```bash
cd webapp
npm run build
```

### 3. Run the server

```bash
cd webapp
npm run start:server
```

The server starts on port **3001** by default. Open `http://yourserverip:3001` in your browser — the map editor loads immediately.

> **Note:** You must run `npm run build` first so the server has a built web app to serve. If you see a JSON 404 at `/`, the build step was skipped or failed.


## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | TCP port the server listens on |
| `HOST` | `0.0.0.0` | Bind address (`127.0.0.1` for local-only) |
| `DATA_DIR` | `./data` | Where device state, images, and templates are stored |
| `BACKUP_DIR` | `./backups` | Daily backup destination |
| `IMAGE_MAX_BYTES` | `2097152` | Max BMP upload size (2 MiB) |
| `TEMPLATE_MAX_BYTES` | `10485760` | Max SVG template upload size (10 MiB) |

---

## Firmware (ESP32)

The firmware sketch is in `client/firmware.ino`. Before flashing, fill in the three constants near the top of the file:

```cpp
const char* WIFI_SSID    = "YOUR_WIFI_SSID";
const char* WIFI_PASS    = "YOUR_WIFI_PASSWORD";
const char* SERVER_HOST  = "http://yourserverip:3001";
```

## Weather

The hourly BMP re-render and the in-app weather HUD use [Open-Meteo](https://open-meteo.com/) for geocoding and current conditions (free, no API key). The server needs outbound HTTPS to `geocoding-api.open-meteo.com` and `api.open-meteo.com`. To use another provider, update `webapp/server/src/services/weather.ts`.

---

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free to self-host and modify for personal, non-commercial use. You may not sell access to a hosted version of this software or use it as part of a commercial offering.

For commercial use, please contact the author.

Trademark Notice: Travelframe® and associated logos are trademarks of Lars Jentzer.

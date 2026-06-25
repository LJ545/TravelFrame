/*
  TravelFrame client Self Hosted Version - ESP32 & 800x480 E-Ink
  ////////////////////////////////////////////////////////////////////////////////////////////////
  Polls the TravelFrame server for a new BMP and re-renders the new map only when the server reports a different ETag than the one that already on screen.
  
  This is the self hosted Version of the TravelFrame Client. It doesnt use HTTPS for ease of use in a home network scenario. Dont expose it to the internet without without hardening its security (eg enabling HTTPS, rate limiting the server and using randomly generated serial or password)
  To configure: fill in WIFI_SSID, WIFI_PASS, SERVER_HOST, and DEVICE_SERIAL (leave at XXXXXXXX when using self hosted platform)
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <SPI.h>
#include <TFT_eSPI.h>

#ifdef EPAPER_ENABLE
EPaper epaper = EPaper();
#endif

//USER SETTINGS
const char* WIFI_SSID  = "YOUR WIFI SSID";
const char* WIFI_PASS  = "YOUR WIFI PASSWORD";

// TravelFrame Server location. No trailing slash.
const char* SERVER_HOST   = "http://yourserverip:3001";
////////////////////////

const char* DEVICE_SERIAL = "XXXXXXXX";

const uint32_t POLL_INTERVAL_MS = 30 * 1000;

static uint16_t screenW = 0;
static uint16_t screenH = 0;
static Preferences prefs;

static String currentEtag = "";

uint16_t readLE16(Stream& s) {
  uint8_t buf[2];
  s.readBytes(buf, 2);
  return (buf[1] << 8) | buf[0];
}

uint32_t readLE32(Stream& s) {
  uint8_t buf[4];
  s.readBytes(buf, 4);
  return ((uint32_t)buf[3] << 24) | ((uint32_t)buf[2] << 16) | ((uint32_t)buf[1] << 8) | buf[0];
}

int32_t readLE32s(Stream& s) {
  return (int32_t)readLE32(s);
}

bool skipBytes(Stream& s, uint32_t n) {
  uint8_t dummy[32];
  while (n > 0) {
    uint32_t toRead = (n > sizeof(dummy)) ? sizeof(dummy) : n;
    if (s.readBytes(dummy, toRead) != toRead) return false;
    n -= toRead;
  }
  return true;
}

String buildImageUrl() {
  String url = SERVER_HOST;
  url += "/device/";
  url += DEVICE_SERIAL;
  url += "/image.bmp";
  return url;
}

//render the BMP body coming from stream into the e-paper framebuffer
bool drawBMPFromStream(WiFiClient& stream) {
  uint16_t signature = readLE16(stream);
  if (signature != 0x4D42) { Serial.println("Not a BMP file"); return false; }

  readLE32(stream); readLE16(stream); readLE16(stream);
  uint32_t pixelOffset   = readLE32(stream);
  uint32_t dibHeaderSize = readLE32(stream);
  int32_t  bmpWidth      = readLE32s(stream);
  int32_t  bmpHeightRaw  = readLE32s(stream);
  uint16_t planes        = readLE16(stream);
  uint16_t bitCount      = readLE16(stream);
  uint32_t compression   = readLE32(stream);

  readLE32(stream); readLE32(stream); readLE32(stream);
  uint32_t colorsUsed = readLE32(stream);
  readLE32(stream);

  if (planes != 1 || compression != 0) {
    Serial.printf("Unsupported BMP (planes=%u, compression=%u)\n", planes, compression);
    return false;
  }
  if (bitCount != 8) {
    Serial.printf("Unsupported bit depth: %u\n", bitCount);
    return false;
  }

  bool topDown = false;
  int32_t bmpHeight = bmpHeightRaw;
  if (bmpHeightRaw < 0) { topDown = true; bmpHeight = -bmpHeightRaw; }

  uint32_t bytesReadSoFar = 14 + 40;
  uint8_t  palette[256];

  uint32_t paletteEntries = colorsUsed ? colorsUsed : 256;
  if (paletteEntries > 256) paletteEntries = 256;
  for (uint32_t i = 0; i < paletteEntries; i++) {
    uint8_t p[4]; stream.readBytes(p, 4);
    palette[i] = p[0];
  }
  bytesReadSoFar += paletteEntries * 4;

  skipBytes(stream, pixelOffset - bytesReadSoFar);

  uint32_t rowSize = ((uint32_t)bitCount * (uint32_t)bmpWidth + 31) / 32 * 4;
  uint8_t* rowBuf  = (uint8_t*)malloc(rowSize);
  if (!rowBuf) { Serial.println("Out of memory for row buffer"); return false; }

#ifdef EPAPER_ENABLE
  epaper.fillScreen(TFT_GRAY_3);
#endif

  int32_t drawWidth  = min((int32_t)screenW, bmpWidth);
  int32_t drawHeight = min((int32_t)screenH, bmpHeight);

  // debug logging
  uint32_t grayCounts[4] = {0, 0, 0, 0};

  for (int32_t row = 0; row < bmpHeight; row++) {
    yield();
    if (stream.readBytes(rowBuf, rowSize) != rowSize) {
      Serial.printf("Short read on row %ld\n", (long)row);
      free(rowBuf);
      return false;
    }

    int32_t y = topDown ? row : (bmpHeight - 1 - row);
    if (y >= drawHeight) continue;

    for (int32_t x = 0; x < drawWidth; x++) {
      uint8_t gray = palette[rowBuf[x]];

      // 4 level grayscale mapping
      uint16_t outColor;
      if (gray < 64) {
        outColor = TFT_GRAY_0;
        grayCounts[0]++;
      } else if (gray < 128) {
        outColor = TFT_GRAY_1;
        grayCounts[1]++;
      } else if (gray < 192) {
        outColor = TFT_GRAY_2;
        grayCounts[2]++;
      } else {
        outColor = TFT_GRAY_3;
        grayCounts[3]++;
      }

#ifdef EPAPER_ENABLE
      if (x >= 0 && y >= 0 && x < screenW && y < screenH) {
        epaper.drawPixel(x, y, outColor);
      }
#endif
    }
  }

  free(rowBuf);
  Serial.printf("render complete: Black:%u, D-Gray:%u, L-Gray:%u, White:%u pixels\n", 
                grayCounts[0], grayCounts[1], grayCounts[2], grayCounts[3]);
  return true;
}

void pollOnce() {
  HTTPClient http;
  http.setTimeout(15000);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  const char* respHeaders[] = { "ETag" };
  http.collectHeaders(respHeaders, 1);

  String url = buildImageUrl();
  if (!http.begin(url)) {
    Serial.println("HTTP begin failed");
    return;
  }
  if (currentEtag.length() > 0) {
    http.addHeader("If-None-Match", currentEtag);
  }

  int code = http.GET();
  if (code == 304) {
    Serial.println("304 Not Modified...nothing to redraw");
    http.end();
    return;
  }
  if (code != HTTP_CODE_OK) {
    Serial.printf("Poll failed, HTTP %d\n", code);
    http.end();
    return;
  }

  String etag = http.header("ETag");
  if (etag.length() == 0) {
    Serial.println("Server returned 200 but no ETag... no render to avoid loops");
    http.end();
    return;
  }
  if (etag == currentEtag) {
    http.end();
    return;
  }

  Serial.printf("New image (etag=%s), rendering...\n", etag.c_str());
  WiFiClient* stream = http.getStreamPtr();
  bool ok = drawBMPFromStream(*stream);
  http.end();

  if (!ok) {
    Serial.println("Render failed. etag not persisted so retry next poll");
    return;
  }

#ifdef EPAPER_ENABLE
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  delay(1000);
  Serial.println("Updating eink...");
  epaper.update();
#endif

  currentEtag = etag;
  prefs.putString("etag", currentEtag);
}

void connectWiFiBlocking() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  uint32_t started = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (millis() - started > 30000) {
      Serial.println("\nWiFi timeout will retry");
      return;
    }
  }
  Serial.println(" connected.");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  prefs.begin("travelframe", false);
  currentEtag = prefs.getString("etag", "");
  Serial.printf("Stored ETag: %s\n", currentEtag.length() ? currentEtag.c_str() : "<none>");

#ifdef EPAPER_ENABLE
  epaper.begin();
  epaper.setRotation(0);
  
  epaper.initGrayMode(GRAY_LEVEL4); 
  
  screenW = epaper.width();
  screenH = epaper.height();
  Serial.printf("Display size: %u x %u\n", screenW, screenH);
#endif

  connectWiFiBlocking();
  pollOnce();
}

void loop() {
  static uint32_t lastPoll = 0;
  if (millis() - lastPoll < POLL_INTERVAL_MS) {
    delay(200);
    return;
  }
  lastPoll = millis();
  connectWiFiBlocking();
  if (WiFi.status() == WL_CONNECTED) {
    pollOnce();
  }
}
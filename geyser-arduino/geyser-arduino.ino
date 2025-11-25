#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266mDNS.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <time.h>
#include <OneWire.h>
#include <DallasTemperature.h>

const char* ssid = "Ahmad2.4G";
const char* password = "App.Store123";

#define TEMP_SENSOR_PIN 4
#define GAS_SENSOR_PIN A0

#define RELAY_ELECTRIC 13
#define RELAY_GAS_VALVE 15
#define RELAY_IGNITION 14
#define PUMP_PIN 16

float TEMP_SETPOINT = 30.0;
float HYSTERESIS = 2.0;
int GAS_THRESHOLD = 1000;

bool MANUAL_MODE = true;
bool AUTO_MODE = false;
bool AUTO_GAS = false;
bool AUTO_ELEC = false;

bool ignitedOnce = false;
bool ignitionDone = false;
unsigned long ignitionStartTime = 0;

unsigned long pumpStartTime = 0;
bool pumpRunning = false;

unsigned long lastMinuteCheck = 0;
bool scheduleActive = false;
String scheduleJson = "[]";

OneWire oneWire(TEMP_SENSOR_PIN);
DallasTemperature sensors(&oneWire);

ESP8266WebServer server(80);

struct ActiveSchedule {
  bool active = false;
  String mode = "";
  float setpoint = 0;
};

// -------------------------------------------------------

void turnAllOff() {
  digitalWrite(RELAY_ELECTRIC, LOW);
  digitalWrite(RELAY_GAS_VALVE, LOW);
  digitalWrite(RELAY_IGNITION, LOW);
  digitalWrite(PUMP_PIN, LOW);
}

// -------------------------------------------------------

void handleManual() {
  if (!server.hasArg("cmd")) {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(400, "text/plain", "Missing cmd");
    return;
  }

  String cmd = server.arg("cmd");

  MANUAL_MODE = true;
  AUTO_MODE = false;
  AUTO_GAS = false;
  AUTO_ELEC = false;

  if (cmd == "ELEC_ON") digitalWrite(RELAY_ELECTRIC, HIGH);
  if (cmd == "ELEC_OFF") digitalWrite(RELAY_ELECTRIC, LOW);

  if (cmd == "GAS_ON") digitalWrite(RELAY_GAS_VALVE, HIGH);
  if (cmd == "GAS_OFF") digitalWrite(RELAY_GAS_VALVE, LOW);

  if (cmd == "IGN_ON") digitalWrite(RELAY_IGNITION, HIGH);
  if (cmd == "IGN_OFF") digitalWrite(RELAY_IGNITION, LOW);

  if (cmd == "PUMP_ON") digitalWrite(PUMP_PIN, HIGH);
  if (cmd == "PUMP_OFF") digitalWrite(PUMP_PIN, LOW);

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "text/plain", "OK");
}

// -------------------------------------------------------

ActiveSchedule getActiveSchedule() {
  ActiveSchedule result;

  DynamicJsonDocument doc(4096);
  deserializeJson(doc, scheduleJson);

  time_t now = time(nullptr);
  struct tm* t = localtime(&now);

  int day = t->tm_wday;                          // 0=Sun
  int currentMin = t->tm_hour * 60 + t->tm_min;  // current minute of day

  for (JsonObject s : doc.as<JsonArray>()) {
    if (!s["enabled"].as<bool>()) continue;

    JsonArray days = s["days"];
    bool matchDay = false;
    for (int d : days)
      if (d == day) matchDay = true;
    if (!matchDay) continue;

    // Time window check
    String startStr = s["startTime"];
    String endStr = s["endTime"];

    int startMin = startStr.substring(0, 2).toInt() * 60 + startStr.substring(3).toInt();
    int endMin = endStr.substring(0, 2).toInt() * 60 + endStr.substring(3).toInt();

    if (currentMin < startMin || currentMin > endMin)
      continue;

    // This schedule is active — return it
    result.active = true;
    result.mode = s["mode"].as<String>();         // "AUTO_GAS" | "AUTO_ELEC" | etc.
    result.setpoint = s["setpoint"].as<float>();  // new feature

    return result;
  }

  return result;
}

void getSchedule() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", scheduleJson);
}

void loadSchedule() {
  if (!LittleFS.exists("/schedule.json")) {
    scheduleJson = "[]";
    return;
  }
  File f = LittleFS.open("/schedule.json", "r");
  scheduleJson = f.readString();
  f.close();
}

void saveSchedule(const String& newEntryJson) {
  DynamicJsonDocument doc(4096);

  if (LittleFS.exists("/schedule.json")) {
    File f = LittleFS.open("/schedule.json", "r");
    deserializeJson(doc, f);
    f.close();
  }

  if (!doc.is<JsonArray>()) {
    doc.clear();
    doc.to<JsonArray>();
  }

  DynamicJsonDocument newEntry(512);
  if (deserializeJson(newEntry, newEntryJson)) {
    Serial.println("Bad entry JSON");
    return;
  }

  doc.as<JsonArray>().add(newEntry.as<JsonObject>());

  File f = LittleFS.open("/schedule.json", "w");
  serializeJson(doc, f);
  f.close();

  scheduleJson = "";
  serializeJson(doc, scheduleJson);
}

// -------------------------------------------------------

bool isScheduleActive() {
  DynamicJsonDocument doc(1024);
  deserializeJson(doc, scheduleJson);

  time_t now = time(nullptr);
  struct tm* t = localtime(&now);

  int currentDay = t->tm_wday;
  int currentMin = t->tm_hour * 60 + t->tm_min;

  for (JsonObject entry : doc.as<JsonArray>()) {
    JsonArray days = entry["days"];

    bool match = false;
    for (int d : days)
      if (d == currentDay) match = true;
    if (!match) continue;

    String startStr = entry["start"];
    String endStr = entry["end"];

    int startMin = startStr.substring(0, 2).toInt() * 60 + startStr.substring(3).toInt();
    int endMin = endStr.substring(0, 2).toInt() * 60 + endStr.substring(3).toInt();

    if (currentMin >= startMin && currentMin <= endMin)
      return true;
  }
  return false;
}

// -------------------------------------------------------

void handleMode() {
  if (!server.hasArg("cmd")) {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(400, "text/plain", "Missing cmd");
    return;
  }

  String cmd = server.arg("cmd");

  if (cmd == "AUTO_ON") {
    AUTO_MODE = true;
    MANUAL_MODE = false;
  }

  if (cmd == "AUTO_OFF") {
    AUTO_MODE = false;
    MANUAL_MODE = true;
    AUTO_GAS = false;
    AUTO_ELEC = false;
    turnAllOff();
  }

  if (cmd == "GAS_AUTO") {
    AUTO_MODE = true;
    AUTO_GAS = true;
    AUTO_ELEC = false;
    MANUAL_MODE = false;
    turnAllOff();
  }

  if (cmd == "ELEC_AUTO") {
    AUTO_MODE = true;
    AUTO_ELEC = true;
    AUTO_GAS = false;
    MANUAL_MODE = false;
    turnAllOff();
  }

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "text/plain", "OK");
}

// -------------------------------------------------------

void handleStatus() {
  sensors.requestTemperatures();
  float temp = sensors.getTempCByIndex(0);
  int gas = analogRead(GAS_SENSOR_PIN);

  String json = "{";
  json += "\"temp\":" + String(temp) + ",";
  json += "\"gas\":" + String(gas) + ",";
  json += "\"electric\":" + String(digitalRead(RELAY_ELECTRIC)) + ",";
  json += "\"gasRelay\":" + String(digitalRead(RELAY_GAS_VALVE)) + ",";
  json += "\"ignition\":" + String(digitalRead(RELAY_IGNITION)) + ",";
  json += "\"pump\":" + String(digitalRead(PUMP_PIN)) + ",";
  json += "\"auto\":" + String(AUTO_MODE) + ",";
  json += "\"autoGas\":" + String(AUTO_GAS) + ",";
  json += "\"autoElec\":" + String(AUTO_ELEC);
  json += "}";

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

// -------------------------------------------------------

void handleSchedulePost() {
  if (!server.hasArg("plain")) {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(400, "text/plain", "Missing body");
    return;
  }

  String body = server.arg("plain");
  saveSchedule(body);

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "text/plain", "SAVED");
}

void handleScheduleOptions() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.send(204);
}

// -------------------------------------------------------

void autoLogic() {
  // schedules only matter when AUTO_MODE is ON
  if (!AUTO_MODE) return;

  // check schedules every 30 sec
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck > 30000) {
    lastCheck = millis();
    ActiveSchedule s = getActiveSchedule();

    if (!s.active) {
      // no schedule → turn everything off
      turnAllOff();
      AUTO_GAS = false;
      AUTO_ELEC = false;
      return;
    }

    // Enable the mode specified by the schedule
    AUTO_GAS = (s.mode == "AUTO_GAS");
    AUTO_ELEC = (s.mode == "AUTO_ELEC");

    // update target temperature
    TEMP_SETPOINT = s.setpoint;
  }

  // ----- Common temperature reading -----
  sensors.requestTemperatures();
  float temp = sensors.getTempCByIndex(0);
  unsigned long now = millis();

  // ------------------- ELECTRIC MODE -------------------
  if (AUTO_ELEC) {
    if (temp < TEMP_SETPOINT - HYSTERESIS)
      digitalWrite(RELAY_ELECTRIC, HIGH);
    else if (temp > TEMP_SETPOINT + HYSTERESIS)
      digitalWrite(RELAY_ELECTRIC, LOW);
  }

  // --------------------- GAS MODE ----------------------
  if (AUTO_GAS) {
    // Pump timeout
    if (pumpRunning && now - pumpStartTime >= 60000) {
      digitalWrite(PUMP_PIN, LOW);
      pumpRunning = false;
    }

    // Heating phase
    if (temp < TEMP_SETPOINT - HYSTERESIS && !pumpRunning) {

      // Gas ON
      if (!digitalRead(RELAY_GAS_VALVE)) {
        digitalWrite(RELAY_GAS_VALVE, HIGH);
        ignitionDone = false;
        ignitionStartTime = millis();
        digitalWrite(RELAY_IGNITION, HIGH);
      }

      // Stop ignition after 5 seconds
      if (!ignitionDone && millis() - ignitionStartTime >= 5000) {
        digitalWrite(RELAY_IGNITION, LOW);
        ignitionDone = true;
      }
    }

    // Reached temp → stop gas + start pump
    if (temp >= TEMP_SETPOINT + HYSTERESIS && !pumpRunning) {
      digitalWrite(RELAY_GAS_VALVE, LOW);
      digitalWrite(RELAY_IGNITION, LOW);

      digitalWrite(PUMP_PIN, HIGH);
      pumpStartTime = millis();
      pumpRunning = true;

      ignitionDone = false;
    }
  }
}


// -------------------------------------------------------

void setup() {
  Serial.begin(115200);
  sensors.begin();
  LittleFS.begin();

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(100);
  }
  Serial.println(WiFi.localIP());

  MDNS.begin("smartgeyser");

  configTime(0, 0, "pool.ntp.org");
  while (time(nullptr) < 100000) delay(100);

  loadSchedule();

  pinMode(RELAY_ELECTRIC, OUTPUT);
  pinMode(RELAY_GAS_VALVE, OUTPUT);
  pinMode(RELAY_IGNITION, OUTPUT);
  pinMode(PUMP_PIN, OUTPUT);

  turnAllOff();

  // --- ROUTES ---
  server.on("/manual", HTTP_GET, handleManual);
  server.on("/mode", HTTP_GET, handleMode);
  server.on("/status", HTTP_GET, handleStatus);

  server.on("/schedule", HTTP_GET, getSchedule);
  server.on("/schedule", HTTP_OPTIONS, handleScheduleOptions);
  server.on("/schedule", HTTP_POST, handleSchedulePost);

  server.begin();
}

// -------------------------------------------------------

void loop() {
  server.handleClient();
  MDNS.update();
  autoLogic();
}

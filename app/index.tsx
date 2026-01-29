import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
// import your native schedule component
import ScheduleCard from "@/components/schedule-card"; // <-- React Native version

const BASE_URL = "http://172.20.10.6";

export default function HomeScreen() {
  const [temp, setTemp] = useState("--");
  const [gas, setGas] = useState("--");
  const [elec, setElec] = useState("--");
  const [gasRelay, setGasRelay] = useState("--");
  const [ign, setIgn] = useState("--");
  const [pump, setPump] = useState("--");

  const send = (cmd: any) => {
    fetch(`${BASE_URL}/manual?cmd=${cmd}`).catch(() => { });
  };

  const mode = (cmd: any) => {
    fetch(`${BASE_URL}/mode?cmd=${cmd}`).catch(() => { });
  };

  useEffect(() => {
    const interval = setInterval(() => {
      console.log("Fetching status...");
      fetch(`${BASE_URL}/status`)
        .then((res) => res.json())
        .then((data) => {
          console.log("Status data:", data);
          setTemp(data.temp);
          setGas(data.gas);
          setElec(data.electric ? "ON" : "OFF");
          setGasRelay(data.gasRelay ? "ON" : "OFF");
          setIgn(data.ignition ? "ON" : "OFF");
          setPump(data.pump ? "ON" : "OFF");
        })
        .catch((err) => {
          console.warn("Status fetch failed:", err?.message || err);
        });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.title}>Smart Geyser Control</Text>

      {/* Sensor Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sensor Status</Text>
        <View style={styles.statusBox}>
          <Text>Temperature: {temp} °C</Text>
        </View>
        <View style={styles.statusBox}>
          <Text>Gas Level: {gas}</Text>
        </View>
      </View>

      {/* Relay Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Relay Status</Text>
        <View style={styles.statusBox}>
          <Text>Electric Relay: {elec}</Text>
        </View>
        <View style={styles.statusBox}>
          <Text>Gas Valve: {gasRelay}</Text>
        </View>
        <View style={styles.statusBox}>
          <Text>Ignition: {ign}</Text>
        </View>
        <View style={styles.statusBox}>
          <Text>Pump: {pump}</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Controls</Text>

        {controlRow(() => send("ELEC_ON"), () => send("ELEC_OFF"), "Electric ON", "Electric OFF")}
        {controlRow(() => send("GAS_ON"), () => send("GAS_OFF"), "Gas ON", "Gas OFF")}
        {controlRow(() => send("IGN_ON"), () => send("IGN_OFF"), "Ignition ON", "Ignition OFF")}
        {controlRow(() => send("PUMP_ON"), () => send("PUMP_OFF"), "Pump ON", "Pump OFF")}
      </View>

      {/* Auto Mode */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Auto Mode</Text>

        <TouchableOpacity style={styles.modeBtn} onPress={() => mode("AUTO_ON")}>
          <Text style={styles.modeText}>Enable Auto Mode</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.modeBtn} onPress={() => mode("ELEC_AUTO")}>
          <Text style={styles.modeText}>Electric Mode</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.modeBtn} onPress={() => mode("GAS_AUTO")}>
          <Text style={styles.modeText}>Gas Mode</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.offBtn, { width: "90%" }]} onPress={() => mode("AUTO_OFF")}>
          <Text style={styles.btnText}>Disable Auto</Text>
        </TouchableOpacity>
      </View>

      {/* Schedules */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Schedules</Text>
        <ScheduleCard apiBaseUrl={BASE_URL} />
      </View>
    </ScrollView>
  );
}

const controlRow = (on: any, off: any, onText: string, offText: string) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
    <TouchableOpacity style={styles.onBtn} onPress={on}>
      <Text style={styles.btnText}>{onText}</Text>
    </TouchableOpacity>

    <TouchableOpacity style={styles.offBtn} onPress={off}>
      <Text style={styles.btnText}>{offText}</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  body: { flexGrow: 1, backgroundColor: "#f5f5f5", padding: 20 },
  title: { fontSize: 26, fontWeight: "bold", marginBottom: 10 },

  card: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },

  cardTitle: { fontSize: 20, marginBottom: 10, fontWeight: "600" },

  statusBox: {
    padding: 12,
    backgroundColor: "#ddd",
    borderRadius: 8,
    marginBottom: 8,
  },

  btnText: { color: "white", fontSize: 16, fontWeight: "600", textAlign: "center" },

  onBtn: {
    padding: 12,
    width: "45%",
    backgroundColor: "#28a73fff",
    borderRadius: 8,
    marginVertical: 5,
  },
  offBtn: {
    padding: 12,
    width: "45%",
    backgroundColor: "#dc3545",
    borderRadius: 8,
    marginVertical: 5,
    alignSelf: "center",
  },
  modeBtn: {
    padding: 12,
    backgroundColor: "#0048ffff",
    borderRadius: 8,
    marginVertical: 5,
    width: "90%",
    alignSelf: "center",
  },
  modeText: { color: "white", fontSize: 18, textAlign: "center" },
});

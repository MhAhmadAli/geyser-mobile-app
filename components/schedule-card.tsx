import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Switch,
  Modal,
  Platform,
  Alert,
  StyleSheet,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Schedule, useSchedules, WEEKDAY_SHORT } from "@/hooks/useSchedules";

/* ---------- Small Button ---------- */
function SmallButton({ onPress, children, style }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.btn, style]}>
      <Text style={[styles.btnText, style.color ? { color: style.color } : {}]}>{children}</Text>
    </TouchableOpacity>
  );
}

/* ---------- Time Picker ---------- */
function TimePickerInput({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const [show, setShow] = useState(false);

  const toDate = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const d = new Date();
    d.setHours(h);
    d.setMinutes(m);
    d.setSeconds(0);
    d.setMilliseconds(0);
    return d;
  };

  const formatTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const onChangeNative = (_: any, selected?: Date) => {
    setShow(false);
    if (selected) onChange(formatTime(selected));
  };

  return (
    <View>
      <TouchableOpacity onPress={() => setShow(true)} style={styles.inputTouchable}>
        <Text style={styles.inputText}>{value ?? "Select time"}</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={toDate(value || "06:00")}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onChangeNative}
        />
      )}
    </View>
  );
}

/* ---------- Days Picker ---------- */
function DaysPicker({ value, onChange }: { value: number[]; onChange: (d: number[]) => void }) {
  const toggle = (idx: number) => {
    if (value.includes(idx)) onChange(value.filter((x) => x !== idx));
    else onChange([...value, idx].sort((a, b) => a - b));
  };
  return (
    <View style={styles.daysRow}>
      {WEEKDAY_SHORT.map((lbl: any, idx: any) => {
        const active = value.includes(idx);
        return (
          <TouchableOpacity
            key={idx}
            onPress={() => toggle(idx)}
            style={[styles.dayBtn, active ? styles.dayBtnActive : styles.dayBtnInactive]}
          >
            <Text style={active ? styles.dayBtnTextActive : styles.dayBtnTextInactive}>{lbl}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ---------- Schedule Form ---------- */
function ScheduleForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: Omit<Schedule, "id">;
  onSubmit: (val: Omit<Schedule, "id">) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [days, setDays] = useState<number[]>(initial.days);
  const [mode, setMode] = useState<"electric" | "gas">(initial.mode);
  const [setpoint, setSetpoint] = useState<number>(initial.setpoint);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [submitting, setSubmitting] = useState(false);

  const validateTime = (t: string) => /^[0-2]?\d:[0-5]\d$/.test(t);

  const submit = async () => {
    if (!name.trim()) return Alert.alert("Validation", "Name is required");
    if (!validateTime(startTime) || !validateTime(endTime)) return Alert.alert("Validation", "Use HH:mm for times");
    if (days.length === 0) return Alert.alert("Validation", "Pick at least one day");

    setSubmitting(true);
    try {
      await onSubmit({ name, startTime, endTime, days, mode, setpoint, enabled, scheduleId: initial.scheduleId });
    } catch (e) {
      console.warn(e);
      Alert.alert("Error", "Failed to save schedule");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.formWrap}>
      <View style={styles.row}>
        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Morning heat" />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Setpoint (°C)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={String(setpoint)}
          onChangeText={(t) => setSetpoint(Number(t || "0"))}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Start</Text>
        <TimePickerInput value={startTime} onChange={setStartTime} />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>End</Text>
        <TimePickerInput value={endTime} onChange={setEndTime} />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Days</Text>
        <DaysPicker value={days} onChange={setDays} />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Mode</Text>
        <View style={styles.modeRow}>
          <TouchableOpacity
            onPress={() => setMode("electric")}
            style={[styles.modeOption, mode === "electric" && styles.modeOptionActive]}
          >
            <Text style={mode === "electric" ? styles.modeOptionTextActive : styles.modeOptionText}>Electric</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMode("gas")}
            style={[styles.modeOption, mode === "gas" && styles.modeOptionActive]}
          >
            <Text style={mode === "gas" ? styles.modeOptionTextActive : styles.modeOptionText}>Gas</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.rowSwitch}>
        <Text style={styles.label}>Enabled</Text>
        <Switch value={enabled} onValueChange={setEnabled} />
      </View>
      <View style={styles.formActions}>
        <SmallButton style={styles.btnOutline} onPress={onCancel}>
          Cancel
        </SmallButton>
        <SmallButton style={styles.btnPrimary} onPress={submit}>
          {submitting ? "Saving..." : "Save"}
        </SmallButton>
      </View>
    </View>
  );
}

/* ---------- Schedule Card ---------- */
export default function ScheduleCard({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { schedules, loading, createSchedule, updateSchedule, deleteSchedule, toggleSchedule, refetch } =
    useSchedules({ apiBaseUrl });

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);

  const sorted = useMemo(
    () =>
      [...(schedules ?? [])].sort(
        (a, b) => a.startTime.localeCompare(b.startTime) || String(a.id).localeCompare(String(b.id))
      ),
    [schedules]
  );

  const startNew = () => {
    setEditing({
      id: "new" as any,
      scheduleId: 0,
      name: "",
      startTime: "06:00",
      endTime: "07:00",
      days: [1, 2, 3, 4, 5],
      mode: "electric",
      setpoint: 55,
      enabled: true,
    } as unknown as Schedule);
    setModalVisible(true);
  };

  const submitEdit = async (val: Omit<Schedule, "id">) => {
    try {
      if (editing && editing.id !== "new") {
        await updateSchedule(editing.id, val);
      } else {
        await createSchedule(val);
      }
      setModalVisible(false);
      setEditing(null);
    } catch (e) {
      console.warn(e);
      Alert.alert("Error", "Failed to save schedule");
    }
  };

  const confirmDelete = (id: Schedule["id"]) => {
    Alert.alert("Delete", "Delete this schedule?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteSchedule(id) },
    ]);
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.cardTitle}>Schedules</Text>
        <View style={styles.headerRight}>
          <SmallButton style={styles.btnOutline} onPress={refetch}>
            Refresh
          </SmallButton>
          <SmallButton style={styles.btnPrimary} onPress={startNew}>
            New
          </SmallButton>
        </View>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={() => (
          <View style={styles.emptyRow}>
            <Text>{loading ? "Loading schedules..." : "No schedules yet"}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={[styles.tableRow, !item.enabled && styles.rowDisabled]} >
            <Text style={[styles.tableCell, { flex: 1.2 }]}>{item.name}</Text>
            <Text style={[styles.tableCell, { flex: 1 }]}> {item.startTime} - {item.endTime} </Text>
            <Text style={[styles.tableCell, { flex: 1.2 }]}> {item.days.map((d: any) => WEEKDAY_SHORT[d]).join(", ")} </Text>
            <Text style={[styles.tableCell, { flex: 0.8 }]}>{item.mode}</Text>
            <Text style={[styles.tableCell, { flex: 0.8 }]}>{item.setpoint}°C</Text>
          </View>

        )}
      />

      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => { setModalVisible(false); setEditing(null); }}>
        <View style={styles.modalWrap}>
          <Text style={styles.modalTitle}>{editing?.id === "new" ? "New schedule" : "Edit schedule"}</Text>
          {editing && (
            <ScheduleForm
              initial={editing}
              onSubmit={submitEdit}
              onCancel={() => { setModalVisible(false); setEditing(null); }}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", padding: 14, borderRadius: 10, marginVertical: 8, elevation: 3 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  headerRight: { flexDirection: "row", gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: "600" },
  btn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#007bff", marginLeft: 8 },
  btnText: { color: "#fff", fontWeight: "600" },
  btnOutline: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd", color: "black" },
  btnPrimary: { backgroundColor: "#007bff" },
  btnDestructive: { backgroundColor: "#dc3545" },
  rowItem: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderColor: "#f2f2f2" },
  rowDisabled: { opacity: 0.6 },
  col: { flex: 1, paddingHorizontal: 4 },
  colActions: { flex: 1.8, flexDirection: "row", justifyContent: "flex-end", alignItems: "center" },
  emptyRow: { padding: 20, alignItems: "center" },
  modalWrap: { flex: 1, padding: 16, backgroundColor: "#fff" },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 12 },
  formWrap: { flex: 1, gap: 12 },
  row: { marginBottom: 10 },
  label: { marginBottom: 6, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#ddd", padding: 10, borderRadius: 8 },
  inputTouchable: { borderWidth: 1, borderColor: "#ddd", padding: 12, borderRadius: 8, backgroundColor: "#fff" },
  inputText: { color: "#111" },
  daysRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dayBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, marginRight: 6, marginBottom: 6 },
  dayBtnActive: { backgroundColor: "#007bff" },
  dayBtnInactive: { backgroundColor: "#f2f2f2" },
  dayBtnTextActive: { color: "#fff" },
  dayBtnTextInactive: { color: "#333" },
  modeRow: { flexDirection: "row", gap: 8 },
  modeOption: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#f2f2f2" },
  modeOptionActive: { backgroundColor: "#007bff" },
  modeOptionText: { color: "#333" },
  modeOptionTextActive: { color: "#fff" },
  rowSwitch: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 },
  tableRow: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderColor: "#ddd", alignItems: "center", },
  tableCell: { fontSize: 14, color: "#000", paddingHorizontal: 4, },
});

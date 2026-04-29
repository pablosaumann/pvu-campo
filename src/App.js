import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const USUARIOS = ["Bárbara", "Roberto", "Joaquín", "Catalina", "Pablo", "Otro"];
const ZONAS = [
  "Baños exteriores", "Casa ranger", "Depósito de leña", "Casa Laura",
  "Casa Richard", "Domo máquinas", "Invernadero", "Sector bosque norte",
  "Sector bosque sur", "Sendero principal", "Zona casona", "Otro"
];
const CLIMA = ["Despejado", "Nublado", "Lluvia leve", "Lluvia fuerte", "Viento", "Niebla"];
const TIPOS_REGISTRO = [
  { id: "raton",          emoji: "🐀", label: "Reporte Ratón",       color: "#5D4037", bg: "#EFEBE9" },
  { id: "murcielago",     emoji: "🦇", label: "Reporte Murciélago",  color: "#4A148C", bg: "#EDE7F6" },
  { id: "observacion",    emoji: "🌿", label: "Observación de Campo", color: "#2E7D32", bg: "#E8F5E9" },
  { id: "infraestructura",emoji: "🔧", label: "Infraestructura",      color: "#E65100", bg: "#FFF3E0" },
  { id: "mision",         emoji: "🪓", label: "Misión de Trabajo",    color: "#1565C0", bg: "#E3F2FD" },
  { id: "tarea",          emoji: "💡", label: "Tarea / Idea",         color: "#B71C1C", bg: "#FFEBEE" },
];
const TIPOS_TRAMPA = ["Plástica marca 1", "Plástica marca 2", "Metal tradicional", "Bluetooth/automática", "Trampa de pegamento"];
const TIPOS_MISION = ["Control de exóticas (zarzamora)", "Limpieza de sendero", "Mantención infraestructura", "Trabajo en vivero", "Monitoreo", "Otra"];
const CAT_OBS    = ["Fauna (animal visible)", "Huella", "Feca", "Nido", "Planta", "Hongo", "Árbol caído o dañado", "Otro"];
const CAT_INFRA  = ["Árbol caído en camino", "Daño en infraestructura", "Cerca rota", "Señalética dañada", "Camino bloqueado", "Daño en edificación", "Otro"];
const URGENCIAS  = ["URGENTE (hoy)", "Normal (próximos días)", "Baja (cuando se pueda)"];
const TIPOS_TAREA = ["Tarea urgente (hacer hoy)", "Tarea pendiente", "Propuesta de mejora", "Idea para el parque", "Recordatorio"];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function now() {
  const d = new Date();
  return {
    fecha: d.toLocaleDateString("es-CL"),
    hora: d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
    iso: d.toISOString(),
  };
}

function loadConfig() {
  try { return JSON.parse(localStorage.getItem("pvu_kobo_config") || "{}"); } catch { return {}; }
}
function saveConfig(cfg) {
  localStorage.setItem("pvu_kobo_config", JSON.stringify(cfg));
}
function loadQueue() {
  try { return JSON.parse(localStorage.getItem("pvu_kobo_queue") || "[]"); } catch { return []; }
}
function saveQueue(q) {
  localStorage.setItem("pvu_kobo_queue", JSON.stringify(q));
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function sendToKobo(payload, config) {
  const instanceID = `uuid:pvu-${Date.now()}-${Math.random().toString(36).substr(2,9)}`;
  
  const fields = Object.entries(payload)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join("");

  const xml = `<?xml version="1.0"?><aXVyjPZ9YmmzGHaK6uHMdb id="aXVyjPZ9YmmzGHaK6uHMdb" version="v8R2NkJgKkcuAzZeSrovhz">${fields}<meta><instanceID>${instanceID}</instanceID></meta></aXVyjPZ9YmmzGHaK6uHMdb>`;

  const formData = new FormData();
  formData.append("xml_submission_file", new Blob([xml], { type: "text/xml" }), "submission.xml");

  const res = await fetch("http://192.168.1.177:3001/kobo/pablosaumann/submission", {
    method: "POST",
    headers: { Authorization: `Token ${config.token}` },
    body: formData,
  });

  const text = await res.text();
 if (!text.includes("Successful submission") && !text.includes("Envío exitoso")) {
    throw new Error(text);
  }
  return text;
}

// ─── COMPONENTES BASE ─────────────────────────────────────────────────────────
function Field({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: "#3E2723", fontFamily: "'DM Sans', sans-serif", letterSpacing: 0.2 }}>
          {label}
        </label>
        {required && <span style={{ fontSize: 10, color: "#B71C1C", fontWeight: 700 }}>●</span>}
      </div>
      {hint && <div style={{ fontSize: 11, color: "#795548", marginBottom: 6, fontStyle: "italic" }}>{hint}</div>}
      {children}
    </div>
  );
}

function Select({ value, onChange, options, placeholder = "Seleccionar..." }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #D7CCC8",
      fontSize: 14, background: "#FAFAFA", color: value ? "#212121" : "#9E9E9E",
      fontFamily: "'DM Sans', sans-serif", outline: "none", appearance: "none",
      backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23795548' stroke-width='1.5' fill='none'/%3E%3C/svg%3E\")",
      backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
    }}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function TextArea({ value, onChange, placeholder, rows = 3, hasVoice }) {
  return (
    <div style={{ position: "relative" }}>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{
        width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #D7CCC8",
        fontSize: 14, fontFamily: "'DM Sans', sans-serif", resize: "none", outline: "none",
        background: "#FAFAFA", color: "#212121", boxSizing: "border-box",
        paddingRight: hasVoice ? 44 : 12,
      }} />
      {hasVoice && (
        <button title="Dictar por voz" style={{
          position: "absolute", right: 8, top: 8, background: "#4CAF50",
          border: "none", borderRadius: 8, width: 32, height: 32,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16,
        }}>🎙️</button>
      )}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", password }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input type={password && !show ? "password" : type} value={value}
        onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
          width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #D7CCC8",
          fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none",
          background: "#FAFAFA", color: "#212121", boxSizing: "border-box",
          paddingRight: password ? 44 : 12,
        }} />
      {password && (
        <button onClick={() => setShow(s => !s)} style={{
          position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer", fontSize: 16,
        }}>{show ? "🙈" : "👁️"}</button>
      )}
    </div>
  );
}

function RadioGroup({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)} style={{
          padding: "8px 14px", borderRadius: 20, border: "1.5px solid",
          borderColor: value === o ? "#2E7D32" : "#D7CCC8",
          background: value === o ? "#2E7D32" : "white",
          color: value === o ? "white" : "#5D4037",
          fontSize: 13, fontFamily: "'DM Sans', sans-serif",
          cursor: "pointer", fontWeight: value === o ? 700 : 400, transition: "all 0.15s",
        }}>{o}</button>
      ))}
    </div>
  );
}

function PhotoBtn({ label }) {
  const [preview, setPreview] = useState(null);
  const ref = useRef();
  return (
    <div>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
        onChange={e => { const f = e.target.files[0]; if (f) setPreview(URL.createObjectURL(f)); }} />
      {preview ? (
        <div style={{ position: "relative" }}>
          <img src={preview} alt="" style={{ width: "100%", borderRadius: 10, maxHeight: 180, objectFit: "cover" }} />
          <button onClick={() => setPreview(null)} style={{
            position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.5)",
            border: "none", borderRadius: 20, color: "white", fontSize: 12, padding: "4px 10px", cursor: "pointer",
          }}>✕ Quitar</button>
        </div>
      ) : (
        <button onClick={() => ref.current.click()} style={{
          width: "100%", padding: "14px", borderRadius: 10, border: "2px dashed #BCAAA4",
          background: "#FFF8F6", color: "#795548", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <span style={{ fontSize: 20 }}>📷</span> {label}
        </button>
      )}
    </div>
  );
}

function SectionCard({ color, bg, emoji, title, children }) {
  return (
    <div style={{ background: bg, borderRadius: 14, padding: "16px 16px", border: `1.5px solid ${color}30`, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: `1.5px solid ${color}30` }}>
        <span style={{ fontSize: 22 }}>{emoji}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color, fontFamily: "'DM Sans', sans-serif" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── MODAL DE CONFIGURACIÓN KOBO ─────────────────────────────────────────────
function SettingsModal({ config, onSave, onClose, pendingCount }) {
  const [token, setToken]     = useState(config.token || "");
  const [assetUid, setAssetUid] = useState(config.assetUid || "");
  const [saved, setSaved]     = useState(false);

  function handleSave() {
    const cfg = { token: token.trim(), assetUid: assetUid.trim() };
    saveConfig(cfg);
    onSave(cfg);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "white", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px",
        width: "100%", maxWidth: 520, boxShadow: "0 -8px 32px rgba(0,0,0,0.2)",
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: "#D7CCC8", borderRadius: 2, margin: "0 auto 20px" }} />

        <div style={{ fontSize: 17, fontWeight: 800, color: "#1B5E20", marginBottom: 4, fontFamily: "'DM Sans', sans-serif" }}>
          ⚙️ Conexión con KoboToolbox
        </div>
        <div style={{ fontSize: 12, color: "#795548", marginBottom: 20, fontFamily: "'DM Sans', sans-serif" }}>
          Los datos se enviarán directamente a tu cuenta cuando presiones Guardar.
        </div>

        {/* Instrucciones colapsables */}
        <details style={{ marginBottom: 16 }}>
          <summary style={{ fontSize: 12, color: "#1565C0", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
            ¿Dónde encuentro estos datos?
          </summary>
          <div style={{ marginTop: 10, fontSize: 12, color: "#5D4037", lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif", background: "#F9F6F2", padding: 12, borderRadius: 8 }}>
            <b>Token de API:</b><br />
            kf.kobotoolbox.org → tu nombre de usuario → Account Settings → API token<br /><br />
            <b>UID del formulario:</b><br />
            Entra al proyecto → la URL termina en <code style={{ background: "#e0e0e0", padding: "1px 4px", borderRadius: 3 }}>/assets/aXXXXXXXXXXXXXXXX/</code><br />
            Ese código es el UID.
          </div>
        </details>

        <Field label="Token de API" required>
          <Input value={token} onChange={setToken} placeholder="Pega tu token aquí..." password />
        </Field>
        <Field label="UID del formulario" required>
          <Input value={assetUid} onChange={setAssetUid} placeholder="aXXXXXXXXXXXXXXXX" />
        </Field>

        {pendingCount > 0 && (
          <div style={{
            background: "#FFF3E0", border: "1.5px solid #FF9800", borderRadius: 10,
            padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#E65100",
            fontFamily: "'DM Sans', sans-serif",
          }}>
            📦 Tienes <b>{pendingCount} registro{pendingCount > 1 ? "s" : ""} en cola local</b> pendiente{pendingCount > 1 ? "s" : ""} de sincronizar.
            Se enviarán automáticamente al guardar los datos de conexión.
          </div>
        )}

        <button onClick={handleSave} disabled={!token || !assetUid} style={{
          width: "100%", padding: "14px", borderRadius: 12,
          background: saved ? "#2E7D32" : (token && assetUid ? "#1B5E20" : "#BDBDBD"),
          border: "none", color: "white", fontSize: 15, fontWeight: 800,
          fontFamily: "'DM Sans', sans-serif", cursor: token && assetUid ? "pointer" : "not-allowed",
          transition: "all 0.2s",
        }}>
          {saved ? "✓ Guardado" : "Guardar conexión"}
        </button>

        {config.token && (
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <button onClick={() => { saveConfig({}); onSave({}); onClose(); }} style={{
              background: "none", border: "none", color: "#B71C1C", fontSize: 12,
              fontFamily: "'DM Sans', sans-serif", cursor: "pointer", textDecoration: "underline",
            }}>Desconectar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SECCIONES ────────────────────────────────────────────────────────────────
function SeccionRaton({ onDataChange }) {
  const [trampas, setTrampas] = useState([{
    id: Date.now(), id_trampa: "", tipo: "", estado: "", captura: "",
    especie: "", cantidad: "", cebo: "", ceboRepuesto: "", notas: "",
  }]);

  useEffect(() => {
    onDataChange?.({ tipo_registro: "raton", trampas });
  }, [trampas]);

  const update = (i, k, v) => setTrampas(t => t.map((tr, idx) => idx === i ? { ...tr, [k]: v } : tr));
  const add = () => setTrampas(t => [...t, {
    id: Date.now(), id_trampa: "", tipo: "", estado: "", captura: "",
    especie: "", cantidad: "", cebo: "", ceboRepuesto: "", notas: "",
  }]);

  return (
    <SectionCard color="#5D4037" bg="#EFEBE9" emoji="🐀" title="REPORTE RATÓN">
      {trampas.map((tr, i) => (
        <div key={tr.id} style={{ background: "white", borderRadius: 10, padding: 14, marginBottom: 12, border: "1px solid #D7CCC8" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#5D4037", marginBottom: 12 }}>
            TRAMPA {i + 1} {trampas.length > 1 && (
              <span style={{ cursor: "pointer", color: "#B71C1C", float: "right" }}
                onClick={() => setTrampas(t => t.filter((_, idx) => idx !== i))}>✕</span>
            )}
          </div>
          <Field label="ID de trampa" required><Input value={tr.id_trampa || ""} onChange={v => update(i, "id_trampa", v)} placeholder="Ej: T-01, T-15..." /></Field>
          <Field label="Tipo de trampa" required><Select value={tr.tipo} onChange={v => update(i, "tipo", v)} options={TIPOS_TRAMPA} /></Field>
          <Field label="Estado" required><Select value={tr.estado} onChange={v => update(i, "estado", v)} options={["Activa", "Dañada", "Necesita reposición", "Faltante"]} /></Field>
          <Field label="¿Hubo captura?" required><RadioGroup options={["Sí", "No"]} value={tr.captura} onChange={v => update(i, "captura", v)} /></Field>
          {tr.captura === "Sí" && <>
            <Field label="Especie capturada"><Select value={tr.especie} onChange={v => update(i, "especie", v)} options={["Rata común", "Laucha", "Roedor no identificado", "Otra especie"]} /></Field>
            <Field label="Número de capturas"><Input type="number" value={tr.cantidad} onChange={v => update(i, "cantidad", v)} placeholder="¿Cuántos?" /></Field>
          </>}
          <Field label="Tipo de cebo" required><Select value={tr.cebo} onChange={v => update(i, "cebo", v)} options={["Maní", "Chocolate", "Avena", "Pegamento", "Sin cebo", "Otro"]} /></Field>
          <Field label="¿Se repuso el cebo?" required><RadioGroup options={["Sí", "No"]} value={tr.ceboRepuesto} onChange={v => update(i, "ceboRepuesto", v)} /></Field>
          <Field label="Foto de la trampa"><PhotoBtn label="Tomar foto" /></Field>
          <Field label="Observaciones"><TextArea value={tr.notas} onChange={v => update(i, "notas", v)} placeholder="Notas, anomalías..." hasVoice /></Field>
        </div>
      ))}
      <button onClick={add} style={{
        width: "100%", padding: 12, borderRadius: 10, border: "2px dashed #A1887F",
        background: "white", color: "#5D4037", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
        cursor: "pointer", fontWeight: 600,
      }}>+ Agregar otra trampa</button>
    </SectionCard>
  );
}

function SeccionMurcielago({ onDataChange }) {
  const [f, setF] = useState({ zona: "", metodo: "", volumen: "", individuos: "", observados: "", estado: "", notas: "" });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  useEffect(() => { onDataChange?.({ tipo_registro: "murcielago", ...f }); }, [f]);
  return (
    <SectionCard color="#4A148C" bg="#EDE7F6" emoji="🦇" title="REPORTE MURCIÉLAGO">
      <div style={{ fontSize: 11, color: "#6A1B9A", marginBottom: 14, padding: "8px 12px", background: "#F3E5F5", borderRadius: 8 }}>
        📅 Registro mensual — Ático de la Casona Holzapfel
      </div>
      <Field label="Zona del ático revisada" required><Select value={f.zona} onChange={v => s("zona", v)} options={["Ático completo", "Sector norte", "Sector sur", "Sector central", "Otro"]} /></Field>
      <Field label="Método de medición" required><Select value={f.metodo} onChange={v => s("metodo", v)} options={["Recipiente medidor (litros)", "Área estimada (m²)", "Peso aproximado (kg)", "Estimación visual"]} /></Field>
      <Field label="Volumen / cantidad registrada" required hint={f.metodo ? `Ingresar en ${f.metodo.includes("litros") ? "litros" : f.metodo.includes("m²") ? "m²" : f.metodo.includes("kg") ? "kg" : "estimación"}` : "Seleccionar método primero"}>
        <Input value={f.volumen} onChange={v => s("volumen", v)} placeholder="Ej: 3.5" type="number" />
      </Field>
      <Field label="Foto general del ático" required><PhotoBtn label="Foto general" /></Field>
      <Field label="Foto de detalle de fecas"><PhotoBtn label="Foto de detalle" /></Field>
      <Field label="¿Se observaron murciélagos?"><RadioGroup options={["Sí", "No", "No revisado"]} value={f.observados} onChange={v => s("observados", v)} /></Field>
      {f.observados === "Sí" && <Field label="Número aproximado de individuos"><Input type="number" value={f.individuos} onChange={v => s("individuos", v)} placeholder="Estimación" /></Field>}
      <Field label="Estado general del ático" required><Select value={f.estado} onChange={v => s("estado", v)} options={["Sin novedad", "Acumulación menor", "Acumulación moderada", "Acumulación alta", "Requiere limpieza urgente"]} /></Field>
      <Field label="Observaciones / notas"><TextArea value={f.notas} onChange={v => s("notas", v)} placeholder="Cambios respecto al mes anterior, anomalías..." hasVoice /></Field>
    </SectionCard>
  );
}

function SeccionObservacion({ onDataChange }) {
  const [f, setF] = useState({ cat: "", especie: "", cantidad: "", confianza: "", inaturalist: "", notas: "" });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  useEffect(() => { onDataChange?.({ tipo_registro: "observacion", ...f }); }, [f]);
  return (
    <SectionCard color="#2E7D32" bg="#E8F5E9" emoji="🌿" title="OBSERVACIÓN DE CAMPO">
      <Field label="Categoría de observación" required><Select value={f.cat} onChange={v => s("cat", v)} options={CAT_OBS} /></Field>
      <Field label="Especie observada / sospecha" hint="Dejar en blanco si no sabe"><TextArea rows={2} value={f.especie} onChange={v => s("especie", v)} placeholder="Ej: puma, pudú, quique, hongo..." hasVoice /></Field>
      <Field label="Cantidad / individuos"><Input type="number" value={f.cantidad} onChange={v => s("cantidad", v)} placeholder="¿Cuántos?" /></Field>
      <Field label="Foto principal"><PhotoBtn label="Foto del hallazgo" /></Field>
      {(f.cat === "Huella" || f.cat === "Feca") && <Field label="Foto de escala" hint="Agrega un objeto de referencia (moneda, lápiz, mano)"><PhotoBtn label="Foto con escala" /></Field>}
      <Field label="Foto adicional"><PhotoBtn label="Foto adicional (opcional)" /></Field>
      <Field label="Descripción / notas"><TextArea value={f.notas} onChange={v => s("notas", v)} placeholder="Comportamiento, dirección, contexto del hallazgo..." hasVoice /></Field>
      <Field label="Nivel de confianza en identificación"><Select value={f.confianza} onChange={v => s("confianza", v)} options={["Alta (estoy seguro/a)", "Media (probable)", "Baja (no estoy seguro/a)"]} /></Field>
      <Field label="¿Subir a iNaturalist?"><RadioGroup options={["Sí", "No", "Ya subido"]} value={f.inaturalist} onChange={v => s("inaturalist", v)} /></Field>
    </SectionCard>
  );
}

function SeccionInfra({ onDataChange }) {
  const [f, setF] = useState({ tipo: "", urgencia: "", puede: "", notificar: [], notas: "" });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggleNot = n => setF(p => ({ ...p, notificar: p.notificar.includes(n) ? p.notificar.filter(x => x !== n) : [...p.notificar, n] }));
  useEffect(() => { onDataChange?.({ tipo_registro: "infraestructura", ...f, notificar: f.notificar.join(", ") }); }, [f]);
  return (
    <SectionCard color="#E65100" bg="#FFF3E0" emoji="🔧" title="INFRAESTRUCTURA">
      <Field label="Tipo de problema" required><Select value={f.tipo} onChange={v => s("tipo", v)} options={CAT_INFRA} /></Field>
      <Field label="Urgencia" required>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {URGENCIAS.map(u => (
            <button key={u} onClick={() => s("urgencia", u)} style={{
              padding: "10px 14px", borderRadius: 10, border: "1.5px solid",
              borderColor: f.urgencia === u ? (u.startsWith("URGENTE") ? "#B71C1C" : u.startsWith("Normal") ? "#E65100" : "#2E7D32") : "#D7CCC8",
              background: f.urgencia === u ? (u.startsWith("URGENTE") ? "#FFEBEE" : u.startsWith("Normal") ? "#FFF3E0" : "#E8F5E9") : "white",
              color: f.urgencia === u ? (u.startsWith("URGENTE") ? "#B71C1C" : u.startsWith("Normal") ? "#E65100" : "#2E7D32") : "#5D4037",
              fontSize: 13, fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
              fontWeight: f.urgencia === u ? 700 : 400, textAlign: "left",
            }}>{u}</button>
          ))}
        </div>
      </Field>
      <Field label="Foto del problema" required><PhotoBtn label="Foto del daño o problema" /></Field>
      <Field label="Descripción del problema" required><TextArea value={f.notas} onChange={v => s("notas", v)} placeholder="Qué pasó, dónde exactamente, qué se necesita..." hasVoice /></Field>
      <Field label="¿Puede solucionarlo solo/a?"><RadioGroup options={["Sí", "No", "Parcialmente"]} value={f.puede} onChange={v => s("puede", v)} /></Field>
      <Field label="¿A quién notificar?" required>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Bárbara", "Pablo", "Joaquín (ranger)", "Todos"].map(n => (
            <button key={n} onClick={() => toggleNot(n)} style={{
              padding: "8px 14px", borderRadius: 20, border: "1.5px solid",
              borderColor: f.notificar.includes(n) ? "#E65100" : "#D7CCC8",
              background: f.notificar.includes(n) ? "#E65100" : "white",
              color: f.notificar.includes(n) ? "white" : "#5D4037",
              fontSize: 13, fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
            }}>{n}</button>
          ))}
        </div>
      </Field>
    </SectionCard>
  );
}

function SeccionMision({ onDataChange }) {
  const [f, setF] = useState({ tipo: "", desc: "", horaInicio: "", horaFin: "", cantidad: "", unidad: "", resultado: "", dificultad: "", notas: "" });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const [iniciada, setIniciada] = useState(false);
  const [finalizada, setFinalizada] = useState(false);
  useEffect(() => { onDataChange?.({ tipo_registro: "mision", ...f }); }, [f]);
  return (
    <SectionCard color="#1565C0" bg="#E3F2FD" emoji="🪓" title="MISIÓN DE TRABAJO">
      <Field label="Tipo de misión" required><Select value={f.tipo} onChange={v => s("tipo", v)} options={TIPOS_MISION} /></Field>
      <Field label="Descripción de la misión" required><TextArea rows={2} value={f.desc} onChange={v => s("desc", v)} placeholder='Ej: "Control de zarzamora en zona A, sector sur del sendero"' hasVoice /></Field>
      {!iniciada ? (
        <button onClick={() => { setIniciada(true); s("horaInicio", new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })); }} style={{
          width: "100%", padding: 14, borderRadius: 10, background: "#1565C0",
          border: "none", color: "white", fontSize: 15, fontWeight: 700,
          fontFamily: "'DM Sans', sans-serif", cursor: "pointer", marginBottom: 12,
        }}>▶ Iniciar misión</button>
      ) : (
        <div style={{ background: "#E3F2FD", borderRadius: 10, padding: 12, marginBottom: 12, border: "1.5px solid #1565C0" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1565C0" }}>✅ MISIÓN INICIADA — {f.horaInicio}</div>
        </div>
      )}
      {iniciada && <>
        <Field label="Foto de entrada (antes)" required><PhotoBtn label="Foto antes de empezar" /></Field>
        <Field label="Notas durante la misión"><TextArea value={f.notas} onChange={v => s("notas", v)} placeholder="Observaciones mientras trabajas..." hasVoice /></Field>
        {!finalizada ? (
          <button onClick={() => { setFinalizada(true); s("horaFin", new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })); }} style={{
            width: "100%", padding: 14, borderRadius: 10, background: "#2E7D32",
            border: "none", color: "white", fontSize: 15, fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif", cursor: "pointer", marginBottom: 12,
          }}>⏹ Finalizar misión</button>
        ) : (
          <div style={{ background: "#E8F5E9", borderRadius: 10, padding: 12, marginBottom: 12, border: "1.5px solid #2E7D32" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#2E7D32" }}>✅ MISIÓN FINALIZADA — {f.horaFin} (duración: {(() => {
              const ini = f.horaInicio.split(":").map(Number);
              const fin = f.horaFin.split(":").map(Number);
              const mins = (fin[0] * 60 + fin[1]) - (ini[0] * 60 + ini[1]);
              return mins > 0 ? `${mins} min` : "—";
            })()})</div>
          </div>
        )}
        {finalizada && <>
          <Field label="Foto de salida (después)" required><PhotoBtn label="Foto después del trabajo" /></Field>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}><Field label="Cantidad realizada"><Input type="number" value={f.cantidad} onChange={v => s("cantidad", v)} placeholder="Núm." /></Field></div>
            <div style={{ flex: 1 }}><Field label="Unidad"><Input value={f.unidad} onChange={v => s("unidad", v)} placeholder="plantas, m², sacos..." /></Field></div>
          </div>
          <Field label="Resultado / evaluación"><TextArea rows={2} value={f.resultado} onChange={v => s("resultado", v)} placeholder="¿Quedó bien? ¿Qué faltó? ¿Requiere seguimiento?" hasVoice /></Field>
          <Field label="Nivel de dificultad"><Select value={f.dificultad} onChange={v => s("dificultad", v)} options={["Fácil", "Normal", "Difícil", "Requiere equipo adicional"]} /></Field>
        </>}
      </>}
    </SectionCard>
  );
}

function SeccionTarea({ onDataChange }) {
  const [f, setF] = useState({ tipo: "", desc: "", urgencia: "", dirigido: [], recursos: "" });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggleD = n => setF(p => ({ ...p, dirigido: p.dirigido.includes(n) ? p.dirigido.filter(x => x !== n) : [...p.dirigido, n] }));
  useEffect(() => { onDataChange?.({ tipo_registro: "tarea", ...f, dirigido: f.dirigido.join(", ") }); }, [f]);
  return (
    <SectionCard color="#B71C1C" bg="#FFEBEE" emoji="💡" title="TAREA / IDEA">
      <Field label="Tipo de anotación" required><Select value={f.tipo} onChange={v => s("tipo", v)} options={TIPOS_TAREA} /></Field>
      <Field label="Descripción" required><TextArea value={f.desc} onChange={v => s("desc", v)} placeholder="¿Qué hay que hacer, o qué idea propones?" hasVoice /></Field>
      <Field label="Foto de referencia"><PhotoBtn label="Foto de referencia (opcional)" /></Field>
      <Field label="Urgencia" required><Select value={f.urgencia} onChange={v => s("urgencia", v)} options={["Hoy", "Esta semana", "Este mes", "Sin plazo definido"]} /></Field>
      <Field label="¿A quién va dirigido?">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Bárbara", "Roberto", "Joaquín", "Catalina", "Pablo", "Todo el equipo"].map(n => (
            <button key={n} onClick={() => toggleD(n)} style={{
              padding: "8px 14px", borderRadius: 20, border: "1.5px solid",
              borderColor: f.dirigido.includes(n) ? "#B71C1C" : "#D7CCC8",
              background: f.dirigido.includes(n) ? "#B71C1C" : "white",
              color: f.dirigido.includes(n) ? "white" : "#5D4037",
              fontSize: 13, fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
            }}>{n}</button>
          ))}
        </div>
      </Field>
      <Field label="Recursos necesarios"><TextArea rows={2} value={f.recursos} onChange={v => s("recursos", v)} placeholder="Herramientas, materiales, personas necesarias..." hasVoice /></Field>
    </SectionCard>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function App() {
  const { fecha, hora, iso } = now();
  const [usuario, setUsuario]   = useState("");
  const [zona, setZona]         = useState("");
  const [clima, setClima]       = useState("");
  const [tipoReg, setTipoReg]   = useState("");
  const [gps, setGps]           = useState(null);

  // Kobo
  const [koboConfig, setKoboConfig]   = useState(loadConfig);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingCount, setPendingCount] = useState(() => loadQueue().length);
  const [sectionData, setSectionData]  = useState({});

  // Submit
  const [submitStatus, setSubmitStatus] = useState(null); // null | 'loading' | 'success' | 'error' | 'offline'
  const [submitError, setSubmitError]   = useState("");

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setGps({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) }),
        () => setGps({ lat: "-41.21340", lng: "-72.48510", sim: true })
      );
    } else {
      setGps({ lat: "-41.21340", lng: "-72.48510", sim: true });
    }
  }, []);

  // Reset section data when type changes
  useEffect(() => { setSectionData({}); }, [tipoReg]);

  const handleDataChange = useCallback((data) => {
    setSectionData(data);
  }, []);

  // Intentar enviar cola pendiente cuando hay config
  async function flushQueue(cfg) {
    const queue = loadQueue();
    if (!queue.length || !cfg.token || !cfg.assetUid) return;
    const failed = [];
    for (const payload of queue) {
      try { await sendToKobo(payload, cfg); }
      catch { failed.push(payload); }
    }
    saveQueue(failed);
    setPendingCount(failed.length);
  }

  async function handleSubmit() {
    if (!usuario || !zona || !tipoReg) return;

    const payload = {
      _submission_time: iso,
      a2_fecha: fecha,
      a3_hora_inicio: hora,
      a4_gps: gps ? `${gps.lat} ${gps.lng}` : "",
      a5_zona: zona,
      a6_condicion_climatica: clima,
      registrador: usuario,
      ...sectionData,
    };

    // Sin conexión a Kobo → guardar localmente
    if (!koboConfig.token || !koboConfig.assetUid) {
      const queue = loadQueue();
      queue.push(payload);
      saveQueue(queue);
      setPendingCount(queue.length);
      setSubmitStatus("offline");
      return;
    }

    setSubmitStatus("loading");
    try {
      await sendToKobo(payload, koboConfig);
      await flushQueue(koboConfig); // aprovechar para enviar cola pendiente
      setSubmitStatus("success");
    } catch (err) {
      // Falló el envío → guardar en cola
      const queue = loadQueue();
      queue.push(payload);
      saveQueue(queue);
      setPendingCount(queue.length);
      setSubmitError(err.message || "Error de red");
      setSubmitStatus("error");
    }
  }

  const tipoActual = TIPOS_REGISTRO.find(t => t.id === tipoReg);
  const isReady    = !!(usuario && zona && tipoReg);
  const isConnected = !!(koboConfig.token && koboConfig.assetUid);

  // ── PANTALLA RESULTADO ────────────────────────────────────────────────────
  if (submitStatus === "success" || submitStatus === "offline") {
    const isOffline = submitStatus === "offline";
    return (
      <div style={{ minHeight: "100vh", background: isOffline ? "#FFF8E1" : "#E8F5E9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>{isOffline ? "📦" : "✅"}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: isOffline ? "#E65100" : "#2E7D32", marginBottom: 8, textAlign: "center" }}>
          {isOffline ? "Guardado localmente" : "Registro enviado a Kobo"}
        </div>
        <div style={{ fontSize: 14, color: isOffline ? "#BF360C" : "#558B2F", marginBottom: 8, textAlign: "center", maxWidth: 280, lineHeight: 1.5 }}>
          {isOffline
            ? "No hay conexión con Kobo configurada. El registro queda en cola y se enviará cuando configures el token (⚙️)."
            : "El registro fue enviado directamente a tu cuenta KoboToolbox."}
        </div>
        <div style={{ fontSize: 12, color: "#795548", marginBottom: 32, textAlign: "center" }}>
          {tipoActual?.emoji} {tipoActual?.label} · {usuario} · {fecha} {hora}
        </div>
        {pendingCount > 0 && (
          <div style={{ background: "#FFF3E0", border: "1.5px solid #FF9800", borderRadius: 10, padding: "10px 16px", marginBottom: 20, fontSize: 12, color: "#E65100" }}>
            📦 {pendingCount} registro{pendingCount > 1 ? "s" : ""} en cola local pendiente{pendingCount > 1 ? "s" : ""}
          </div>
        )}
        <button onClick={() => { setTipoReg(""); setSubmitStatus(null); setSectionData({}); }} style={{
          padding: "14px 32px", borderRadius: 30, background: isOffline ? "#E65100" : "#2E7D32",
          border: "none", color: "white", fontSize: 16, fontWeight: 700,
          fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
        }}>+ Nuevo registro</button>
      </div>
    );
  }

  // ── PANTALLA ERROR ────────────────────────────────────────────────────────
  if (submitStatus === "error") {
    return (
      <div style={{ minHeight: "100vh", background: "#FFEBEE", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#B71C1C", marginBottom: 8, textAlign: "center" }}>Error al enviar</div>
        <div style={{ fontSize: 13, color: "#C62828", marginBottom: 8, textAlign: "center", maxWidth: 280 }}>{submitError}</div>
        <div style={{ fontSize: 12, color: "#795548", marginBottom: 32, textAlign: "center" }}>
          El registro quedó guardado en cola local y se reintentará automáticamente.
        </div>
        <button onClick={() => { setTipoReg(""); setSubmitStatus(null); setSectionData({}); }} style={{
          padding: "14px 32px", borderRadius: 30, background: "#B71C1C",
          border: "none", color: "white", fontSize: 16, fontWeight: 700,
          fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
        }}>+ Nuevo registro</button>
      </div>
    );
  }

  // ── FORMULARIO PRINCIPAL ──────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F9F6F2", fontFamily: "'DM Sans', sans-serif" }}>

      {/* HEADER */}
      <div style={{
        background: "linear-gradient(135deg, #1B5E20 0%, #2E7D32 60%, #388E3C 100%)",
        padding: "20px 20px 24px", position: "sticky", top: 0, zIndex: 10,
        boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🌿</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "white", letterSpacing: 0.5 }}>PARQUE VALLE LOS ULMOS</div>
              <div style={{ fontSize: 11, color: "#A5D6A7" }}>Sistema de Registro de Campo</div>
            </div>
          </div>
          {/* Botón configuración */}
          <button onClick={() => setShowSettings(true)} style={{
            background: isConnected ? "rgba(255,255,255,0.2)" : "rgba(255,152,0,0.3)",
            border: isConnected ? "1px solid rgba(255,255,255,0.3)" : "1px solid #FF9800",
            borderRadius: 10, padding: "8px 12px", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
          }}>
            <span style={{ fontSize: 18 }}>⚙️</span>
            <span style={{ fontSize: 9, color: isConnected ? "#C8E6C9" : "#FFCC02", fontWeight: 700, lineHeight: 1 }}>
              {isConnected ? "Kobo ✓" : pendingCount > 0 ? `${pendingCount} en cola` : "Configurar"}
            </span>
          </button>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, color: "#C8E6C9", display: "flex", alignItems: "center", gap: 4 }}>
            📅 {fecha} · {hora}
          </div>
          <div style={{ fontSize: 11, color: "#C8E6C9", display: "flex", alignItems: "center", gap: 4 }}>
            📍 {gps ? `${gps.lat}, ${gps.lng}${gps.sim ? " (sim)" : ""}` : "Obteniendo GPS..."}
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 520, margin: "0 auto" }}>

        {/* Banner si no hay Kobo configurado */}
        {!isConnected && (
          <div onClick={() => setShowSettings(true)} style={{
            background: "#FFF3E0", border: "1.5px solid #FF9800", borderRadius: 12,
            padding: "10px 14px", marginBottom: 16, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>🔌</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#E65100" }}>Kobo no configurado</div>
              <div style={{ fontSize: 11, color: "#BF360C" }}>Los registros se guardarán localmente. Toca para conectar.</div>
            </div>
          </div>
        )}

        {/* SECCIÓN A — Identificación */}
        <SectionCard color="#2E7D32" bg="#F1F8E9" emoji="🪪" title="IDENTIFICACIÓN">
          <Field label="Tu nombre" required>
            <Select value={usuario} onChange={setUsuario} options={USUARIOS} placeholder="¿Quién registra?" />
          </Field>
          <Field label="Zona del parque" required>
            <Select value={zona} onChange={setZona} options={ZONAS} />
          </Field>
          <Field label="Condición climática">
            <Select value={clima} onChange={setClima} options={CLIMA} />
          </Field>
        </SectionCard>

        {/* SECCIÓN B — Tipo de registro */}
        <SectionCard color="#5D4037" bg="#EFEBE9" emoji="🔀" title="¿QUÉ VAS A REGISTRAR?">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {TIPOS_REGISTRO.map(t => (
              <button key={t.id} onClick={() => setTipoReg(t.id)} style={{
                padding: "14px 10px", borderRadius: 12, border: "2px solid",
                borderColor: tipoReg === t.id ? t.color : "#D7CCC8",
                background: tipoReg === t.id ? t.bg : "white",
                cursor: "pointer", transition: "all 0.15s",
                boxShadow: tipoReg === t.id ? `0 2px 8px ${t.color}40` : "none",
              }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{t.emoji}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: tipoReg === t.id ? t.color : "#5D4037", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.3 }}>{t.label}</div>
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Sección condicional */}
        {tipoReg === "raton"          && <SeccionRaton          onDataChange={handleDataChange} />}
        {tipoReg === "murcielago"     && <SeccionMurcielago     onDataChange={handleDataChange} />}
        {tipoReg === "observacion"    && <SeccionObservacion    onDataChange={handleDataChange} />}
        {tipoReg === "infraestructura"&& <SeccionInfra          onDataChange={handleDataChange} />}
        {tipoReg === "mision"         && <SeccionMision         onDataChange={handleDataChange} />}
        {tipoReg === "tarea"          && <SeccionTarea          onDataChange={handleDataChange} />}

        {/* BOTÓN ENVIAR */}
        {tipoReg && (
          <button
            onClick={handleSubmit}
            disabled={!isReady || submitStatus === "loading"}
            style={{
              width: "100%", padding: "16px", borderRadius: 14,
              background: !isReady
                ? "#BDBDBD"
                : submitStatus === "loading"
                ? "#78909C"
                : isConnected
                ? "linear-gradient(135deg, #1B5E20, #388E3C)"
                : "linear-gradient(135deg, #E65100, #FF6D00)",
              border: "none", color: "white", fontSize: 16, fontWeight: 800,
              fontFamily: "'DM Sans', sans-serif",
              cursor: isReady && submitStatus !== "loading" ? "pointer" : "not-allowed",
              boxShadow: isReady ? "0 4px 16px rgba(0,0,0,0.25)" : "none",
              marginBottom: 32, letterSpacing: 0.5, transition: "all 0.2s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {submitStatus === "loading" ? (
              <>
                <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span>
                Enviando a Kobo...
              </>
            ) : !isReady ? (
              "Completa nombre y zona para continuar"
            ) : isConnected ? (
              "✓ Guardar en Kobo"
            ) : (
              "📦 Guardar localmente (sin Kobo)"
            )}
          </button>
        )}
      </div>

      {/* MODAL CONFIGURACIÓN */}
      {showSettings && (
        <SettingsModal
          config={koboConfig}
          pendingCount={pendingCount}
          onSave={cfg => { setKoboConfig(cfg); flushQueue(cfg); }}
          onClose={() => setShowSettings(false)}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

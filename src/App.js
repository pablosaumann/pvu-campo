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
  { id: "raton",       emoji: "🐀", label: "Reporte Ratón",        color: "#5D4037", bg: "#EFEBE9" },
  { id: "murcielago",  emoji: "🦇", label: "Reporte Murciélago",   color: "#4A148C", bg: "#EDE7F6" },
  { id: "observacion", emoji: "🌿", label: "Observación de Campo",  color: "#2E7D32", bg: "#E8F5E9" },
  { id: "mision",      emoji: "🪓", label: "Misión de Trabajo",     color: "#1565C0", bg: "#E3F2FD" },
  { id: "tarea",       emoji: "💡", label: "Tarea / Compromiso",    color: "#B71C1C", bg: "#FFEBEE" },
];
const TIPOS_TRAMPA = ["Plástica marca 1", "Plástica marca 2", "Metal tradicional", "Bluetooth/automática", "Trampa de pegamento"];
const TIPOS_MISION = ["Control de Exóticos", "Mantención de sendero", "Mantención infraestructura", "Monitoreo", "Otra (especificar)"];
const CAT_OBS = ["Fauna (animal visible)", "Huella", "Feca", "Nido", "Planta", "Hongo", "Árbol caído o dañado", "Otro"];
const TIPOS_TAREA = ["Nueva Tarea", "Propuesta de mejora", "Compromiso", "Requerimiento de Insumos"];

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
function loadRegistrador() {
  return localStorage.getItem("pvu_registrador") || "";
}
function saveRegistrador(nombre) {
  localStorage.setItem("pvu_registrador", nombre.trim());
}
function loadTrampasDB() {
  try {
    const saved = localStorage.getItem("pvu_trampas_db");
    if (saved) return JSON.parse(saved);
  } catch {}
  return Array.from({ length: 10 }, (_, i) => ({
    id: `T-${String(i + 1).padStart(2, "0")}`,
    tipo: null,
    fecha_inicio: null,
    es_default: true,
  }));
}
function saveTrampasDB(list) {
  localStorage.setItem("pvu_trampas_db", JSON.stringify(list));
}
function loadEspeciesDB() {
  try {
    const saved = localStorage.getItem("pvu_especies_db");
    if (saved) return JSON.parse(saved);
  } catch {}
  return ["Rata Rattus", "Roedor no identificado"];
}
function saveEspeciesDB(list) {
  localStorage.setItem("pvu_especies_db", JSON.stringify(list));
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

  const res = await fetch("https://pvu-proxy.onrender.com/kobo/pablosaumann/submission", {
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

// ─── PANTALLA DE BIENVENIDA (primera vez) ────────────────────────────────────
function OnboardingScreen({ onConfirm }) {
  const [nombre, setNombre] = useState("");
  const [modo, setModo] = useState("lista"); // "lista" | "libre"
  const isValid = nombre.trim().length >= 2;

  return (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(160deg, #1B5E20 0%, #2E7D32 50%, #388E3C 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>🌿</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "white", letterSpacing: 0.5, marginBottom: 4, textAlign: "center" }}>
        PARQUE VALLE LOS ULMOS
      </div>
      <div style={{ fontSize: 13, color: "#A5D6A7", marginBottom: 32, textAlign: "center" }}>
        Sistema de Registro de Campo
      </div>

      <div style={{
        background: "white", borderRadius: 20, padding: "28px 24px",
        width: "100%", maxWidth: 380, boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#1B5E20", marginBottom: 6 }}>
          👋 ¿Quién eres?
        </div>
        <div style={{ fontSize: 12, color: "#795548", marginBottom: 20, lineHeight: 1.5 }}>
          Tu nombre se guardará en este teléfono. No tendrás que ingresarlo de nuevo.
        </div>

        {/* Selector equipo */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {USUARIOS.filter(u => u !== "Otro").map(u => (
            <button key={u} onClick={() => { setNombre(u); setModo("lista"); }} style={{
              padding: "9px 16px", borderRadius: 20, border: "1.5px solid",
              borderColor: nombre === u && modo === "lista" ? "#2E7D32" : "#D7CCC8",
              background: nombre === u && modo === "lista" ? "#2E7D32" : "white",
              color: nombre === u && modo === "lista" ? "white" : "#5D4037",
              fontSize: 14, fontWeight: nombre === u && modo === "lista" ? 700 : 400,
              cursor: "pointer", transition: "all 0.15s",
            }}>{u}</button>
          ))}
          <button onClick={() => { setNombre(""); setModo("libre"); }} style={{
            padding: "9px 16px", borderRadius: 20, border: "1.5px solid",
            borderColor: modo === "libre" ? "#1565C0" : "#D7CCC8",
            background: modo === "libre" ? "#E3F2FD" : "white",
            color: modo === "libre" ? "#1565C0" : "#9E9E9E",
            fontSize: 14, cursor: "pointer", transition: "all 0.15s",
          }}>+ Otro nombre</button>
        </div>

        {/* Input libre */}
        {modo === "libre" && (
          <div style={{ marginBottom: 16 }}>
            <input
              autoFocus
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Escribe tu nombre..."
              style={{
                width: "100%", padding: "11px 14px", borderRadius: 10,
                border: "1.5px solid #1565C0", fontSize: 15,
                fontFamily: "'DM Sans', sans-serif", outline: "none",
                background: "#F9F6F2", color: "#212121", boxSizing: "border-box",
              }}
            />
          </div>
        )}

        <button
          onClick={() => { if (isValid) { saveRegistrador(nombre); onConfirm(nombre.trim()); } }}
          disabled={!isValid}
          style={{
            width: "100%", padding: "14px", borderRadius: 12,
            background: isValid ? "linear-gradient(135deg, #1B5E20, #388E3C)" : "#BDBDBD",
            border: "none", color: "white", fontSize: 15, fontWeight: 800,
            fontFamily: "'DM Sans', sans-serif",
            cursor: isValid ? "pointer" : "not-allowed", transition: "all 0.2s",
            boxShadow: isValid ? "0 4px 14px rgba(27,94,32,0.4)" : "none",
          }}
        >
          {isValid ? `Entrar como ${nombre}` : "Selecciona tu nombre para continuar"}
        </button>
      </div>
    </div>
  );
}

// ─── MODAL DE CONFIGURACIÓN KOBO ─────────────────────────────────────────────
function SettingsModal({ config, onSave, onClose, pendingCount, registrador, onChangeRegistrador }) {
  const [token, setToken]     = useState(config.token || "");
  const [assetUid, setAssetUid] = useState(config.assetUid || "");
  const [saved, setSaved]     = useState(false);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nuevoNombre, setNuevoNombre]       = useState(registrador);

  function handleSave() {
    const cfg = { token: token.trim(), assetUid: assetUid.trim() };
    saveConfig(cfg);
    onSave(cfg);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  function handleGuardarNombre() {
    if (nuevoNombre.trim().length >= 2) {
      saveRegistrador(nuevoNombre.trim());
      onChangeRegistrador(nuevoNombre.trim());
      setEditandoNombre(false);
    }
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

        {/* Sección registrador */}
        <div style={{
          background: "#F1F8E9", border: "1.5px solid #A5D6A7", borderRadius: 12,
          padding: "12px 14px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#2E7D32", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>
            👤 Registrador en este teléfono
          </div>
          {editandoNombre ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={nuevoNombre}
                onChange={e => setNuevoNombre(e.target.value)}
                style={{
                  flex: 1, padding: "8px 10px", borderRadius: 8, border: "1.5px solid #2E7D32",
                  fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none",
                }}
              />
              <button onClick={handleGuardarNombre} style={{
                padding: "8px 12px", borderRadius: 8, background: "#2E7D32",
                border: "none", color: "white", fontSize: 13, fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
              }}>✓</button>
              <button onClick={() => { setEditandoNombre(false); setNuevoNombre(registrador); }} style={{
                padding: "8px 10px", borderRadius: 8, background: "#EFEBE9",
                border: "none", color: "#5D4037", fontSize: 13,
                fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
              }}>✕</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#1B5E20", fontFamily: "'DM Sans', sans-serif" }}>
                {registrador}
              </span>
              <button onClick={() => setEditandoNombre(true)} style={{
                background: "none", border: "none", color: "#1565C0", fontSize: 12,
                fontFamily: "'DM Sans', sans-serif", cursor: "pointer", textDecoration: "underline",
              }}>Cambiar</button>
            </div>
          )}
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
const CEBOS_RATON = ["Maní", "Avena", "Avena con vainilla", "Avena o semilla", "Sin cebo", "Otro"];

function SeccionRaton({ onDataChange }) {
  const [trampasDB, setTrampasDB] = useState(loadTrampasDB);
  const [especiesDB, setEspeciesDB] = useState(loadEspeciesDB);

  const newEntry = () => ({
    _key: Date.now() + Math.random(),
    id_trampa: "", estado: "", captura: "",
    especie: "", especie_nueva: "",
    cebo: "", cebo_desc: "", cebo_repuesto: "", notas: "",
    // mini-form nueva trampa
    modo_nueva: false, nueva_nombre: "", nueva_tipo: "",
    nueva_fecha: new Date().toLocaleDateString("es-CL"),
  });

  const [entries, setEntries] = useState([newEntry()]);

  useEffect(() => {
    onDataChange?.({ tipo_registro: "raton", trampas: entries });
  }, [entries]);

  const upd = (i, patch) =>
    setEntries(t => t.map((e, idx) => idx === i ? { ...e, ...patch } : e));

  function confirmarNuevaTrampa(i, e) {
    if (!e.nueva_nombre.trim()) return;
    const nueva = {
      id: e.nueva_nombre.trim(),
      tipo: e.nueva_tipo || null,
      fecha_inicio: e.nueva_fecha,
      es_default: false,
    };
    const newDB = [...trampasDB, nueva];
    setTrampasDB(newDB);
    saveTrampasDB(newDB);
    upd(i, { id_trampa: nueva.id, modo_nueva: false, nueva_nombre: "", nueva_tipo: "" });
  }

  function confirmarNuevaEspecie(i, e) {
    const nombre = e.especie_nueva.trim();
    if (!nombre) return;
    const newDB = especiesDB.includes(nombre) ? especiesDB : [...especiesDB, nombre];
    setEspeciesDB(newDB);
    saveEspeciesDB(newDB);
    upd(i, { especie: nombre, especie_nueva: "" });
  }

  const selectStyle = {
    width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #D7CCC8",
    fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none",
    background: "#FAFAFA", color: "#212121", appearance: "none",
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23795548' stroke-width='1.5' fill='none'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
  };

  return (
    <SectionCard color="#5D4037" bg="#EFEBE9" emoji="🐀" title="REPORTE RATÓN">
      {entries.map((e, i) => (
        <div key={e._key} style={{ background: "white", borderRadius: 10, padding: 14, marginBottom: 12, border: "1px solid #D7CCC8" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#5D4037", marginBottom: 12 }}>
            TRAMPA {i + 1} {entries.length > 1 && (
              <span style={{ cursor: "pointer", color: "#B71C1C", float: "right" }}
                onClick={() => setEntries(t => t.filter((_, idx) => idx !== i))}>✕</span>
            )}
          </div>

          {/* ── Selector de trampa ── */}
          <Field label="ID de trampa" required>
            <select value={e.id_trampa}
              onChange={ev => {
                const val = ev.target.value;
                upd(i, { id_trampa: val, modo_nueva: val === "__nueva__" });
              }}
              style={selectStyle}>
              <option value="">Seleccionar trampa...</option>
              {trampasDB.map(t => (
                <option key={t.id} value={t.id}>
                  {t.id}{t.tipo ? ` — ${t.tipo}` : ""}{!t.es_default && t.fecha_inicio ? ` (desde ${t.fecha_inicio})` : ""}
                </option>
              ))}
              <option value="__nueva__">➕ Nueva trampa</option>
            </select>
          </Field>

          {/* ── Mini-form: Nueva trampa ── */}
          {e.modo_nueva && (
            <div style={{ background: "#FFF8F6", border: "1.5px dashed #BCAAA4", borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#5D4037", marginBottom: 10 }}>
                📋 Registrar nueva trampa
              </div>
              <Field label="Nombre / código" required>
                <Input value={e.nueva_nombre} onChange={v => upd(i, { nueva_nombre: v })} placeholder="Ej: T-11, T-casona..." />
              </Field>
              <Field label="Tipo de trampa">
                <Select value={e.nueva_tipo} onChange={v => upd(i, { nueva_tipo: v })} options={TIPOS_TRAMPA} />
              </Field>
              <Field label="Foto de la trampa">
                <PhotoBtn label="Foto inicial de la trampa" />
              </Field>
              <div style={{ fontSize: 11, color: "#795548", marginBottom: 10 }}>
                📅 Fecha de inicio: <b>{e.nueva_fecha}</b>
              </div>
              <button onClick={() => confirmarNuevaTrampa(i, e)}
                disabled={!e.nueva_nombre.trim()}
                style={{
                  width: "100%", padding: 10, borderRadius: 8,
                  background: e.nueva_nombre.trim() ? "#5D4037" : "#BDBDBD",
                  border: "none", color: "white", fontSize: 13, fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: e.nueva_nombre.trim() ? "pointer" : "not-allowed",
                }}>
                ✓ Agregar {e.nueva_nombre.trim() ? `"${e.nueva_nombre.trim()}"` : "trampa"}
              </button>
            </div>
          )}

          {/* ── Resto del formulario (solo con trampa seleccionada) ── */}
          {e.id_trampa && e.id_trampa !== "__nueva__" && (
            <>
              <Field label="Estado" required>
                <Select value={e.estado} onChange={v => upd(i, { estado: v })}
                  options={["Activa", "Dañada", "Necesita reposición", "Faltante"]} />
              </Field>
              <Field label="¿Hubo captura?" required>
                <RadioGroup options={["Sí", "No"]} value={e.captura} onChange={v => upd(i, { captura: v })} />
              </Field>

              {e.captura === "Sí" && (
                <Field label="Especie capturada">
                  <select value={e.especie}
                    onChange={ev => upd(i, { especie: ev.target.value, especie_nueva: "" })}
                    style={selectStyle}>
                    <option value="">Seleccionar especie...</option>
                    {especiesDB.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                    <option value="__nueva_especie__">+ Registrar nueva especie</option>
                  </select>
                  {e.especie === "__nueva_especie__" && (
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <input value={e.especie_nueva}
                        onChange={ev => upd(i, { especie_nueva: ev.target.value })}
                        placeholder="Nombre de la especie..."
                        style={{
                          flex: 1, padding: "9px 12px", borderRadius: 8,
                          border: "1.5px solid #2E7D32", fontSize: 14,
                          fontFamily: "'DM Sans', sans-serif", outline: "none",
                        }} />
                      <button onClick={() => confirmarNuevaEspecie(i, e)}
                        disabled={!e.especie_nueva.trim()}
                        style={{
                          padding: "9px 14px", borderRadius: 8,
                          background: e.especie_nueva.trim() ? "#2E7D32" : "#BDBDBD",
                          border: "none", color: "white", fontSize: 13, fontWeight: 700,
                          fontFamily: "'DM Sans', sans-serif",
                          cursor: e.especie_nueva.trim() ? "pointer" : "not-allowed",
                        }}>✓</button>
                    </div>
                  )}
                </Field>
              )}

              <Field label="Tipo de cebo" required>
                <Select value={e.cebo} onChange={v => upd(i, { cebo: v })} options={CEBOS_RATON} />
              </Field>
              {e.cebo === "Otro" && (
                <Field label="Describir el cebo" required>
                  <Input value={e.cebo_desc} onChange={v => upd(i, { cebo_desc: v })} placeholder="¿Qué cebo se usó?" />
                </Field>
              )}
              <Field label="¿Se repuso el cebo?" required>
                <RadioGroup options={["Sí", "No"]} value={e.cebo_repuesto} onChange={v => upd(i, { cebo_repuesto: v })} />
              </Field>
              <Field label="Foto de la trampa"><PhotoBtn label="Tomar foto" /></Field>
              <Field label="Observaciones">
                <TextArea value={e.notas} onChange={v => upd(i, { notas: v })} placeholder="Notas, anomalías..." hasVoice />
              </Field>
            </>
          )}
        </div>
      ))}
    </SectionCard>
  );
}

function SeccionMurcielago({ onDataChange }) {
  const [f, setF] = useState({ volumen: "", individuos: "", observados: "", notas: "" });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  useEffect(() => { onDataChange?.({ tipo_registro: "murcielago", ...f }); }, [f]);
  return (
    <SectionCard color="#4A148C" bg="#EDE7F6" emoji="🦇" title="REPORTE MURCIÉLAGO">
      <div style={{ fontSize: 11, color: "#6A1B9A", marginBottom: 14, padding: "8px 12px", background: "#F3E5F5", borderRadius: 8 }}>
        📅 Registro mensual — Ático de la Casona Holzapfel
      </div>
      <Field label="Volumen / cantidad registrada" required hint="Ingresar estimación">
        <Input value={f.volumen} onChange={v => s("volumen", v)} placeholder="Ej: 3.5" type="number" />
      </Field>
      <Field label="Foto general del ático" required><PhotoBtn label="Foto general" /></Field>
      <Field label="Foto de detalle de fecas"><PhotoBtn label="Foto de detalle" /></Field>
      <Field label="¿Se observaron murciélagos?"><RadioGroup options={["Sí", "No", "No revisado"]} value={f.observados} onChange={v => s("observados", v)} /></Field>
      {f.observados === "Sí" && <Field label="Número aproximado de individuos"><Input type="number" value={f.individuos} onChange={v => s("individuos", v)} placeholder="Estimación" /></Field>}
      <Field label="Observaciones / notas"><TextArea value={f.notas} onChange={v => s("notas", v)} placeholder="Cambios respecto al mes anterior, anomalías..." hasVoice /></Field>
    </SectionCard>
  );
}

function SeccionObservacion({ onDataChange }) {
  const [f, setF] = useState({ cat: "", especie: "", cantidad: "", notas: "" });
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
    </SectionCard>
  );
}

function SeccionMision({ onDataChange }) {
  const [f, setF] = useState({ tipo: "", tipo_desc: "", desc: "", horaInicio: "", horaFin: "", cantidad: "", unidad: "", resultado: "", dificultad: "", notas: "" });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const [iniciada, setIniciada] = useState(false);
  const [finalizada, setFinalizada] = useState(false);
  useEffect(() => { onDataChange?.({ tipo_registro: "mision", ...f }); }, [f]);
  return (
    <SectionCard color="#1565C0" bg="#E3F2FD" emoji="🪓" title="MISIÓN DE TRABAJO">
      <Field label="Tipo de misión" required><Select value={f.tipo} onChange={v => s("tipo", v)} options={TIPOS_MISION} /></Field>
      {f.tipo === "Otra (especificar)" && (
        <Field label="Especificar tipo de misión" required>
          <Input value={f.tipo_desc} onChange={v => s("tipo_desc", v)} placeholder="Describe el tipo de misión..." />
        </Field>
      )}
      <Field label="Descripción de la misión" required><TextArea rows={2} value={f.desc} onChange={v => s("desc", v)} placeholder='Ej: "Control de exóticos en zona A, sector sur del sendero"' hasVoice /></Field>
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
  const [f, setF] = useState({ tipo: "", desc: "", urgencia: "", fecha_compromiso: "", dirigido: [], recursos: "" });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggleD = n => setF(p => ({ ...p, dirigido: p.dirigido.includes(n) ? p.dirigido.filter(x => x !== n) : [...p.dirigido, n] }));
  useEffect(() => { onDataChange?.({ tipo_registro: "tarea", ...f, dirigido: f.dirigido.join(", ") }); }, [f]);
  return (
    <SectionCard color="#B71C1C" bg="#FFEBEE" emoji="💡" title="TAREA / COMPROMISO">
      <Field label="Tipo" required><Select value={f.tipo} onChange={v => s("tipo", v)} options={TIPOS_TAREA} /></Field>
      {f.tipo === "Compromiso" && (
        <Field label="Fecha comprometida" required>
          <input type="date" value={f.fecha_compromiso} onChange={e => s("fecha_compromiso", e.target.value)} style={{
            width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #D7CCC8",
            fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none",
            background: "#FAFAFA", color: "#212121", boxSizing: "border-box",
          }} />
        </Field>
      )}
      <Field label="Descripción" required><TextArea value={f.desc} onChange={v => s("desc", v)} placeholder="¿Qué hay que hacer, o qué se compromete?" hasVoice /></Field>
      <Field label="Foto de referencia"><PhotoBtn label="Foto de referencia (opcional)" /></Field>
      <Field label="Urgencia"><Select value={f.urgencia} onChange={v => s("urgencia", v)} options={["Hoy", "Esta semana", "Este mes", "Sin plazo definido"]} /></Field>
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
  const [registrador, setRegistrador] = useState(loadRegistrador);
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
    if (!tipoReg) return;

    const payload = {
      _submission_time: iso,
      a2_fecha: fecha,
      a3_hora_inicio: hora,
      a4_gps: gps ? `${gps.lat} ${gps.lng}` : "",
      registrador: registrador,
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
  const isReady    = !!tipoReg;
  const isConnected = !!(koboConfig.token && koboConfig.assetUid);

  // ── PANTALLA ONBOARDING (primera vez) ────────────────────────────────────
  if (!registrador) {
    return <OnboardingScreen onConfirm={nombre => setRegistrador(nombre)} />;
  }

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
          {tipoActual?.emoji} {tipoActual?.label} · {registrador} · {fecha} {hora}
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
              <div style={{ fontSize: 11, color: "#A5D6A7" }}>Sistema de Registro de Campo · 👤 {registrador}</div>
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
              "Selecciona el tipo de registro para continuar"
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
          registrador={registrador}
          onChangeRegistrador={nombre => setRegistrador(nombre)}
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

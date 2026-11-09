const API_URL = "https://dietapp.santi-czere.workers.dev"; // tu Worker de Cloudflare. Vacío = modo demo

const $ = s => document.querySelector(s);
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } },
             set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const load = (k, d) => { try { return JSON.parse(ls.get(k)) ?? d; } catch { return d; } };
const save = (k, v) => ls.set(k, JSON.stringify(v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const iso = d => d.toLocaleDateString("sv");
const today = () => iso(new Date());
const at = s => new Date(s + "T12:00");
const shift = (s, n) => { const d = at(s); d.setDate(d.getDate() + n); return iso(d); };
const key = d => "nutri:" + d;
const sum = a => a.reduce((s, e) => s + (+e.kcal || 0), 0);

const MEALS = [["desayuno","Desayuno"],["almuerzo","Almuerzo"],["merienda","Merienda"],["cena","Cena"],["snack","Snack"]];
const mealNow = () => { const h = new Date().getHours(); return h < 11 ? "desayuno" : h < 15 ? "almuerzo" : h < 19 ? "merienda" : "cena"; };
const CIRC = 2 * Math.PI * 95;

let date = today();
let entries = load(key(date), []);
let profile = load("nutri:profile", null);
if (profile) profile.goal = { lose: "lose_mod", gain: "gain_mod" }[profile.goal] || profile.goal; // perfiles de la v2

// ---------- Metas ----------
function targets() {
  if (profile) return profile.t;
  const k = load("nutri:goal", 2000);
  return { kcal: k, p: Math.round(k * .25 / 4), c: Math.round(k * .45 / 4), f: Math.round(k * .30 / 9) };
}

const GOALS = { lose_light: -.10, lose_mod: -.20, lose_agg: -.30, keep: 0, gain_light: .05, gain_mod: .10, gain_agg: .15 };
const GOAL_NAMES = { lose_light: "déficit leve", lose_mod: "déficit moderado", lose_agg: "déficit agresivo", keep: "mantener peso", gain_light: "superávit leve", gain_mod: "superávit moderado", gain_agg: "superávit agresivo" };

// Fórmula de Mifflin-St Jeor + factor de actividad + ajuste según objetivo
function calc(x) {
  const bmr = 10 * x.w + 6.25 * x.h - 5 * x.age + (x.sex === "m" ? 5 : -161);
  const tdee = Math.round(bmr * x.act / 10) * 10;
  const floor = x.sex === "m" ? 1500 : 1200;
  const want = Math.round(tdee * (1 + GOALS[x.goal]) / 10) * 10;
  const kcal = Math.max(floor, want);
  const p = Math.round(x.w * (x.goal === "lose_agg" ? 2 : x.goal.startsWith("lose") ? 1.8 : 1.6));
  const f = Math.round(kcal * .25 / 9);
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  return { tdee, kcal, p, c, f, diff: kcal - tdee, floored: want < floor };
}

// ---------- Pantalla ----------
function render() {
  const T = targets(), t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  entries.forEach(e => Object.keys(t).forEach(k => t[k] += +e[k] || 0));
  const isToday = date === today();

  $("#today").textContent = (isToday ? "Hoy, " : "") + at(date).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  $("#dNext").disabled = isToday;
  $("#kcal").textContent = Math.round(t.kcal);
  const diff = T.kcal - t.kcal;
  $("#left").textContent = diff >= 0 ? `de ${T.kcal} kcal · te quedan ${Math.round(diff)}` : `${Math.round(-diff)} kcal por encima de tu meta`;

  const ring = $("#prog");
  ring.style.strokeDasharray = CIRC;
  ring.style.strokeDashoffset = CIRC * (1 - Math.min(t.kcal / T.kcal, 1));
  ring.classList.toggle("over", diff < 0);

  [["p","protein",T.p],["c","carbs",T.c],["f","fat",T.f]].forEach(([id, k, g]) => {
    $(`#${id}T`).textContent = `${Math.round(t[k])} / ${g} g`;
    $(`#${id}B`).style.width = Math.min(t[k] / g * 100, 100) + "%";
  });
  $("#metaTxt").textContent = profile ? `Objetivo: ${GOAL_NAMES[profile.goal] || "personalizado"}.` : "Esta es una meta de ejemplo.";
  $("#profLink").textContent = profile ? "Editar perfil" : "Calcular mi meta";

  const row = e => `<li><div><strong>${esc(e.name)}</strong><small>${esc(e.time)} · P ${+e.protein || 0} g · C ${+e.carbs || 0} g · G ${+e.fat || 0} g</small></div>
    <b>${+e.kcal || 0} kcal</b><button class="x" data-i="${e.i}" aria-label="Eliminar ${esc(e.name)}">✕</button></li>`;
  const groups = MEALS.map(([id, name]) => ({ name, items: entries.map((e, i) => ({ ...e, i })).filter(e => (e.meal || "snack") === id) })).filter(g => g.items.length);
  $("#list").innerHTML = groups.length
    ? groups.map(g => `<li class="grp">${g.name}<span>${Math.round(sum(g.items))} kcal</span></li>${g.items.map(row).join("")}`).join("")
    : `<li class="empty">Todavía no registraste nada este día. Sacale una foto a tu plato o cargalo a mano.</li>`;

  week(T);
}

function week(T) {
  const days = [...Array(7)].map((_, i) => shift(date, i - 6));
  const vals = days.map(d => d === date ? sum(entries) : sum(load(key(d), [])));
  const max = Math.max(T.kcal * 1.3, ...vals);
  $("#week").innerHTML = `<div class="goalline" style="bottom:${36 + T.kcal / max * 150}px"></div>` +
    days.map((d, i) => `<button class="wk ${vals[i] ? "has" : ""} ${vals[i] > T.kcal ? "over" : ""} ${d === date ? "sel" : ""}" data-d="${d}" title="${Math.round(vals[i])} kcal" aria-label="${at(d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric" })}: ${Math.round(vals[i])} kcal">
      <div class="col"><i style="height:${vals[i] / max * 100}%"></i></div><span>${at(d).toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "")}</span></button>`).join("");
}

function goTo(d) { date = d; entries = load(key(d), []); $("#analizar").hidden = true; render(); }

let tt;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2800);
}

// ---------- Foto + IA ----------
function resize(file, max = 1024) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL("image/jpeg", .8));
    };
    img.onerror = () => fail(new Error("No se pudo leer la imagen"));
    img.src = URL.createObjectURL(file);
  });
}

async function analyze(dataUrl) {
  if (!API_URL) {
    await new Promise(r => setTimeout(r, 1200));
    return { name: "Plato de ejemplo (modo demo)", kcal: 520, protein: 32, carbs: 48, fat: 20, note: "Modo demo: conectá tu Worker en API_URL." };
  }
  const res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl.split(",")[1], mediaType: "image/jpeg" }) });
  if (!res.ok) throw new Error("el servidor respondió " + res.status);
  return res.json();
}

function openPanel(photo) {
  $("#form").reset();
  $("#fMeal").value = mealNow();
  $("#note").textContent = "";
  $("#prevBox").hidden = !photo;
  $("#analizar").classList.toggle("solo", !photo);
  $("#analizar").hidden = false;
  $("#analizar").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function handle(file) {
  const form = $("#form"), st = $("#status");
  openPanel(true);
  form.classList.add("wait");
  st.textContent = "Analizando tu plato…";
  try {
    const url = await resize(file);
    $("#img").src = url;
    const r = await analyze(url);
    if (r.error) throw new Error(r.error);
    $("#fName").value = r.name;
    $("#fK").value = Math.round(r.kcal); $("#fP").value = Math.round(r.protein);
    $("#fC").value = Math.round(r.carbs); $("#fF").value = Math.round(r.fat);
    $("#note").textContent = r.note || "";
    st.textContent = "Listo. Corregí lo que quieras antes de agregar.";
  } catch (err) {
    st.textContent = "No se pudo analizar: " + err.message + ". Podés cargar los datos a mano.";
  } finally { form.classList.remove("wait"); }
}

async function pick(e) {
  const f = e.target.files[0];
  if (!f) return;
  e.target.value = "";
  await handle(f);
}

$("#camBtn").onclick = () => $("#cam").click();
$("#galBtn").onclick = () => $("#gal").click();
$("#manBtn").onclick = () => openPanel(false);
$("#cam").onchange = pick;
$("#gal").onchange = pick;
$("#cancelBtn").onclick = () => { $("#analizar").hidden = true; };

$("#form").onsubmit = e => {
  e.preventDefault();
  const e1 = { name: $("#fName").value.trim(), meal: $("#fMeal").value, kcal: +$("#fK").value,
    protein: +$("#fP").value || 0, carbs: +$("#fC").value || 0, fat: +$("#fF").value || 0,
    time: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) };
  entries.push(e1);
  save(key(date), entries);
  $("#analizar").hidden = true;
  render();
  scrollTo({ top: 0, behavior: "smooth" });
  toast(`Agregado: ${e1.name} (${e1.kcal} kcal)`);
};

$("#list").onclick = e => {
  const b = e.target.closest(".x");
  if (!b) return;
  entries.splice(+b.dataset.i, 1);
  save(key(date), entries);
  render();
  toast("Comida eliminada");
};

$("#week").onclick = e => { const b = e.target.closest(".wk"); if (b) goTo(b.dataset.d); };
$("#dPrev").onclick = () => goTo(shift(date, -1));
$("#dNext").onclick = () => date !== today() && goTo(shift(date, 1));

// ---------- Perfil ----------
const dlg = $("#dlg");
const fields = () => ({ sex: $("#pSex").value, age: +$("#pAge").value, w: +$("#pW").value, h: +$("#pH").value, act: +$("#pAct").value, goal: $("#pGoal").value });
const valid = x => x.age >= 14 && x.age <= 90 && x.w >= 30 && x.h >= 120;

function preview() {
  const x = fields();
  if (!valid(x)) { $("#pRes").textContent = "Completá tus datos para ver tu meta."; return; }
  const r = calc(x), d = r.diff;
  const line = d ? `${d < 0 ? "Déficit" : "Superávit"} de ${Math.abs(d)} kcal por día, cerca de ${Math.abs(d * 7 / 7700).toFixed(2).replace(".", ",")} kg por semana (estimado).` : "Es lo que gastás por día para mantener tu peso.";
  const warn = r.floored ? " Ajustamos tu meta al mínimo diario de seguridad."
    : x.goal === "lose_agg" ? " Un déficit agresivo es exigente: conviene sostenerlo poco tiempo y, si podés, con seguimiento profesional."
    : x.goal === "gain_agg" ? " Un superávit alto también suma grasa, no solo músculo." : "";
  $("#pRes").innerHTML = `<strong>${r.kcal} kcal por día</strong>Tu gasto diario estimado es de ${r.tdee} kcal. ${line}${warn} Tu objetivo: ${r.p} g de proteínas, ${r.c} g de carbohidratos y ${r.f} g de grasas.`;
}

function openProfile() {
  if (profile) { $("#pSex").value = profile.sex; $("#pAge").value = profile.age; $("#pW").value = profile.w; $("#pH").value = profile.h; $("#pAct").value = profile.act; $("#pGoal").value = profile.goal; }
  preview();
  dlg.returnValue = "";
  dlg.showModal();
}

$("#pf").oninput = preview;
$("#profBtn").onclick = openProfile;
$("#profLink").onclick = openProfile;
dlg.onclose = () => {
  const x = fields();
  if (dlg.returnValue === "ok" && valid(x)) {
    profile = { ...x, t: calc(x) };
    save("nutri:profile", profile);
    render();
    toast(`Meta guardada: ${profile.t.kcal} kcal por día`);
  }
};

// ---------- Tema ----------
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  ls.set("nutri:theme", t);
  $("#themeBtn").textContent = t === "dark" ? "Modo claro" : "Modo oscuro";
  document.querySelector('meta[name="theme-color"]').content = t === "dark" ? "#10231a" : "#e8f1e1";
}
$("#themeBtn").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

// ---------- Respaldo de datos ----------
async function exportData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("nutri:")) data[k] = localStorage.getItem(k); }
  const name = `dietapp-respaldo-${today()}.json`;
  const file = new File([JSON.stringify({ app: "dietapp", v: 1, data })], name, { type: "application/json" });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: "Respaldo de DietApp" }); return; }
  } catch (e) { if (e.name === "AbortError") return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Respaldo descargado");
}

async function importData(file) {
  try {
    const j = JSON.parse(await file.text());
    const d = j.data || {}, keys = Object.keys(d).filter(k => k.startsWith("nutri:"));
    if (j.app !== "dietapp" || !keys.length) throw 0;
    const dias = keys.filter(k => /^nutri:\d{4}-/.test(k)).length;
    if (!confirm(`Se van a cargar ${dias} días de comidas y tu perfil. Si ya tenés datos de esos mismos días, se reemplazan. ¿Seguimos?`)) return;
    keys.forEach(k => ls.set(k, d[k]));
    toast("Datos importados");
    setTimeout(() => location.reload(), 700);
  } catch { toast("Ese archivo no parece un respaldo de DietApp"); }
}

$("#expBtn").onclick = exportData;
$("#impBtn").onclick = () => $("#impFile").click();
$("#impFile").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) importData(f); };

// ---------- Instalación (iPhone) ----------
const standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
if (/iphone|ipad/i.test(navigator.userAgent) && !standalone && !ls.get("nutri:tipHidden")) $("#tip").hidden = false;
$("#tipX").onclick = () => { $("#tip").hidden = true; ls.set("nutri:tipHidden", "1"); };
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

// ---------- Inicio ----------
setTheme(document.documentElement.dataset.theme || "light");
navigator.storage?.persist?.(); // pide al navegador no borrar tus datos
render();
if (!profile && !ls.get("nutri:seen")) { ls.set("nutri:seen", "1"); setTimeout(openProfile, 500); }
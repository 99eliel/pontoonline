import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  app: null,
  auth: null,
  db: null,
  storage: null,
  currentFuncionario: null,
  currentAdmin: null,
  cameraStream: null,
  lastAdminPoints: [],
  employees: []
};

const els = {
  badge: $("#connectionBadge"),
  toast: $("#toast"),
  btnInstall: $("#btnInstall"),
  clockTime: $("#clockTime"),
  clockDate: $("#clockDate"),
  funcLoginForm: $("#funcLoginForm"),
  adminLoginForm: $("#adminLoginForm"),
  funcLoginCard: $("#funcLoginCard"),
  funcArea: $("#funcArea"),
  adminLoginCard: $("#adminLoginCard"),
  adminArea: $("#adminArea"),
  funcName: $("#funcName"),
  funcMeta: $("#funcMeta"),
  locationStatus: $("#locationStatus"),
  cameraStatus: $("#cameraStatus"),
  cameraVideo: $("#cameraVideo"),
  photoCanvas: $("#photoCanvas"),
  funcPointsList: $("#funcPointsList"),
  employeesList: $("#employeesList"),
  pointsTableBody: $("#pointsTableBody")
};

function init() {
  bindUi();
  startClock();
  registerServiceWorker();
  initFirebase();
}

function bindUi() {
  $$(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".tab").forEach((tab) => tab.classList.remove("active"));
      $$(".view").forEach((view) => view.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.target).classList.add("active");
    });
  });

  els.funcLoginForm.addEventListener("submit", handleFuncionarioLogin);
  els.adminLoginForm.addEventListener("submit", handleAdminLogin);
  $("#btnFuncLogout").addEventListener("click", logoutAll);
  $("#btnAdminLogout").addEventListener("click", logoutAll);
  $("#btnStartCamera").addEventListener("click", startCamera);
  $("#btnReloadFuncPoints").addEventListener("click", loadFuncionarioPoints);
  $("#employeeForm").addEventListener("submit", saveEmployee);
  $("#btnClearEmployee").addEventListener("click", clearEmployeeForm);
  $("#btnReloadEmployees").addEventListener("click", loadEmployees);
  $("#btnReloadPoints").addEventListener("click", loadAdminPoints);
  $("#btnExportCsv").addEventListener("click", exportPointsCsv);
  $("#employeeSearch").addEventListener("input", renderEmployees);
  $("#filterStart").addEventListener("input", renderAdminPoints);
  $("#filterEnd").addEventListener("input", renderAdminPoints);
  $("#filterEmployee").addEventListener("input", renderAdminPoints);

  $$(".btn.point").forEach((button) => {
    button.addEventListener("click", () => registerPoint(button.dataset.point, button));
  });

  $("#funcCpf").addEventListener("input", (e) => e.target.value = maskCpf(e.target.value));
  $("#empCpf").addEventListener("input", (e) => e.target.value = maskCpf(e.target.value));

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    els.btnInstall.classList.remove("hidden");
  });
  els.btnInstall.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    els.btnInstall.classList.add("hidden");
  });
}

function initFirebase() {
  const missingConfig = !firebaseConfig?.apiKey || firebaseConfig.apiKey.includes("COLE_SUA");
  if (missingConfig) {
    setBadge("Firebase não configurado", "error");
    showToast("Cole a configuração do seu projeto em firebase-config.js antes de testar.", "error");
    return;
  }

  try {
    state.app = initializeApp(firebaseConfig);
    state.auth = getAuth(state.app);
    state.db = getFirestore(state.app);
    state.storage = getStorage(state.app);
    setBadge("Conectado ao Firebase", "ok");

    onAuthStateChanged(state.auth, async (user) => {
      if (!user) return;
      if (user.isAnonymous) {
        await tryRestoreFuncionarioSession(user.uid);
      } else {
        await tryRestoreAdminSession(user.uid);
      }
    });
  } catch (error) {
    console.error(error);
    setBadge("Erro no Firebase", "error");
    showToast(formatFirebaseError(error), "error");
  }
}

function startClock() {
  const tick = () => {
    const now = new Date();
    els.clockTime.textContent = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    els.clockDate.textContent = now.toLocaleDateString("pt-BR");
  };
  tick();
  setInterval(tick, 1000);
}

async function handleFuncionarioLogin(event) {
  event.preventDefault();
  try {
    ensureFirebaseReady();
  } catch (error) {
    return showToast(formatFirebaseError(error), "error");
  }

  const cpf = onlyDigits($("#funcCpf").value);
  const birth = $("#funcBirth").value;

  if (cpf.length !== 11) return showToast("Informe um CPF com 11 números.", "error");
  if (!birth) return showToast("Informe a data de nascimento.", "error");

  setFormLoading(els.funcLoginForm, true);
  try {
    if (state.auth.currentUser && !state.auth.currentUser.isAnonymous) {
      await signOut(state.auth);
    }

    if (!state.auth.currentUser) {
      await signInAnonymously(state.auth);
    }

    const uid = state.auth.currentUser.uid;
    await setDoc(doc(state.db, "sessoes", uid), {
      cpf,
      nascimentoInformado: birth,
      criadoEm: serverTimestamp(),
      ultimoAcesso: serverTimestamp(),
      userAgent: navigator.userAgent
    });

    const funcionarioSnap = await getDoc(doc(state.db, "funcionarios", cpf));
    if (!funcionarioSnap.exists()) throw new Error("Funcionário não encontrado.");

    state.currentFuncionario = { id: cpf, ...funcionarioSnap.data(), uid };
    showFuncionarioArea();
    await loadFuncionarioPoints();
    showToast("Login realizado. Agora ative a câmera e bata o ponto.");
  } catch (error) {
    console.error(error);
    showToast(formatFirebaseError(error), "error");
  } finally {
    setFormLoading(els.funcLoginForm, false);
  }
}

async function tryRestoreFuncionarioSession(uid) {
  try {
    const sessionSnap = await getDoc(doc(state.db, "sessoes", uid));
    if (!sessionSnap.exists()) return;
    const { cpf } = sessionSnap.data();
    const funcionarioSnap = await getDoc(doc(state.db, "funcionarios", cpf));
    if (!funcionarioSnap.exists()) return;

    state.currentFuncionario = { id: cpf, ...funcionarioSnap.data(), uid };
    showFuncionarioArea();
    await loadFuncionarioPoints();
  } catch (error) {
    console.warn("Não foi possível restaurar sessão do funcionário", error);
  }
}

function showFuncionarioArea() {
  const funcionario = state.currentFuncionario;
  els.funcLoginCard.classList.add("hidden");
  els.funcArea.classList.remove("hidden");
  els.funcName.textContent = funcionario.nome || "Funcionário";
  els.funcMeta.textContent = `${formatCpf(funcionario.id)} • ${funcionario.setor || "Sem setor"} • ${funcionario.cargo || "Sem cargo"}`;
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return showToast("Este navegador não liberou câmera. Teste em HTTPS ou em outro navegador.", "error");
  }

  try {
    stopCamera();
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
      audio: false
    });
    els.cameraVideo.srcObject = state.cameraStream;
    els.cameraStatus.textContent = "Ativa";
    showToast("Câmera ativada.");
  } catch (error) {
    console.error(error);
    els.cameraStatus.textContent = "Bloqueada";
    showToast("Não foi possível acessar a câmera. Verifique as permissões do navegador.", "error");
  }
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
  }
}

async function registerPoint(tipo, button) {
  try {
    ensureFirebaseReady();
  } catch (error) {
    return showToast(formatFirebaseError(error), "error");
  }
  if (!state.currentFuncionario) return showToast("Faça login como funcionário primeiro.", "error");
  if (!state.cameraStream) return showToast("Ative a câmera antes de bater o ponto.", "error");

  const label = tipoLabel(tipo);
  const confirmed = window.confirm(`Confirmar registro de ${label}?`);
  if (!confirmed) return;

  button.disabled = true;
  try {
    els.locationStatus.textContent = "Capturando...";
    const location = await getLocation();
    els.locationStatus.textContent = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;

    const photoBlob = await capturePhotoBlob();
    const pontoRef = doc(collection(state.db, "pontos"));
    const fotoPath = `pontos/${state.currentFuncionario.id}/${pontoRef.id}.jpg`;
    const fotoRef = ref(state.storage, fotoPath);

    await uploadBytes(fotoRef, photoBlob, { contentType: "image/jpeg" });
    const fotoUrl = await getDownloadURL(fotoRef);

    await setDoc(pontoRef, {
      authUid: state.auth.currentUser.uid,
      funcionarioCpf: state.currentFuncionario.id,
      funcionarioNome: state.currentFuncionario.nome || "",
      setor: state.currentFuncionario.setor || "",
      cargo: state.currentFuncionario.cargo || "",
      tipo,
      dataHora: serverTimestamp(),
      createdAt: serverTimestamp(),
      localizacao: location,
      fotoPath,
      fotoUrl,
      origem: "web",
      userAgent: navigator.userAgent
    });

    showToast(`${label} registrado com sucesso.`);
    await loadFuncionarioPoints();
  } catch (error) {
    console.error(error);
    showToast(formatFirebaseError(error), "error");
  } finally {
    button.disabled = false;
  }
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalização não disponível neste navegador."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        capturedAt: new Date().toISOString()
      }),
      () => reject(new Error("Não foi possível pegar a localização. Verifique as permissões do navegador.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function capturePhotoBlob() {
  return new Promise((resolve, reject) => {
    const video = els.cameraVideo;
    const canvas = els.photoCanvas;
    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) {
      reject(new Error("A câmera ainda não carregou a imagem. Tente novamente."));
      return;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Não foi possível gerar a foto."));
      else resolve(blob);
    }, "image/jpeg", 0.86);
  });
}

async function loadFuncionarioPoints() {
  if (!state.currentFuncionario) return;
  try {
    const q = query(
      collection(state.db, "pontos"),
      where("authUid", "==", state.auth.currentUser.uid),
      limit(30)
    );
    const snap = await getDocs(q);
    const items = snap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => getMillis(b.createdAt || b.dataHora) - getMillis(a.createdAt || a.dataHora))
      .slice(0, 10);

    if (!items.length) {
      els.funcPointsList.className = "list empty";
      els.funcPointsList.textContent = "Nenhum ponto registrado ainda.";
      return;
    }

    els.funcPointsList.className = "list";
    els.funcPointsList.innerHTML = items.map((item) => `
      <div class="list-item">
        <div class="item-main">
          <strong>${tipoLabel(item.tipo)}</strong>
          <small>${formatTimestamp(item.dataHora || item.createdAt)}</small>
        </div>
        <small>${item.localizacao ? `${item.localizacao.lat.toFixed(5)}, ${item.localizacao.lng.toFixed(5)} • precisão ${Math.round(item.localizacao.accuracy || 0)}m` : "Sem localização"}</small>
      </div>
    `).join("");
  } catch (error) {
    console.error(error);
    showToast(formatFirebaseError(error), "error");
  }
}

async function handleAdminLogin(event) {
  event.preventDefault();
  try {
    ensureFirebaseReady();
  } catch (error) {
    return showToast(formatFirebaseError(error), "error");
  }

  const email = $("#adminEmail").value.trim();
  const password = $("#adminPassword").value;

  setFormLoading(els.adminLoginForm, true);
  try {
    if (state.auth.currentUser?.isAnonymous) await signOut(state.auth);
    const credential = await signInWithEmailAndPassword(state.auth, email, password);
    const adminSnap = await getDoc(doc(state.db, "admins", credential.user.uid));

    if (!adminSnap.exists() || adminSnap.data().ativo !== true) {
      await signOut(state.auth);
      throw new Error("Este usuário ainda não está liberado como administrador.");
    }

    state.currentAdmin = { uid: credential.user.uid, ...adminSnap.data() };
    await showAdminArea();
    showToast("Painel administrativo liberado.");
  } catch (error) {
    console.error(error);
    showToast(formatFirebaseError(error), "error");
  } finally {
    setFormLoading(els.adminLoginForm, false);
  }
}

async function tryRestoreAdminSession(uid) {
  try {
    const adminSnap = await getDoc(doc(state.db, "admins", uid));
    if (!adminSnap.exists() || adminSnap.data().ativo !== true) return;
    state.currentAdmin = { uid, ...adminSnap.data() };
    await showAdminArea();
  } catch (error) {
    console.warn("Não foi possível restaurar sessão do admin", error);
  }
}

async function showAdminArea() {
  els.adminLoginCard.classList.add("hidden");
  els.adminArea.classList.remove("hidden");
  $("#adminName").textContent = state.currentAdmin.nome || state.currentAdmin.email || "Administrador";
  await Promise.all([loadEmployees(), loadAdminPoints()]);
}

async function saveEmployee(event) {
  event.preventDefault();
  try {
    ensureFirebaseReady();
  } catch (error) {
    return showToast(formatFirebaseError(error), "error");
  }

  const cpf = onlyDigits($("#empCpf").value);
  const nome = $("#empName").value.trim();
  const nascimento = $("#empBirth").value;

  if (cpf.length !== 11) return showToast("CPF do funcionário deve ter 11 números.", "error");
  if (!nome || !nascimento) return showToast("Preencha nome, CPF e nascimento.", "error");

  try {
    await setDoc(doc(state.db, "funcionarios", cpf), {
      cpf,
      nome,
      nascimento,
      setor: $("#empSector").value.trim(),
      cargo: $("#empRole").value.trim(),
      ativo: $("#empActive").checked,
      atualizadoEm: serverTimestamp(),
      criadoEm: serverTimestamp()
    }, { merge: true });

    showToast("Funcionário salvo com sucesso.");
    clearEmployeeForm();
    await loadEmployees();
  } catch (error) {
    console.error(error);
    showToast(formatFirebaseError(error), "error");
  }
}

async function loadEmployees() {
  try {
    const q = query(collection(state.db, "funcionarios"), orderBy("nome"), limit(300));
    const snap = await getDocs(q);
    state.employees = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderEmployees();
  } catch (error) {
    console.error(error);
    showToast(formatFirebaseError(error), "error");
  }
}

function renderEmployees() {
  const term = onlyDigitsOrText($("#employeeSearch").value);
  const items = state.employees.filter((emp) => {
    const target = `${emp.nome || ""} ${emp.cpf || emp.id || ""}`.toLowerCase();
    return !term || target.includes(term.toLowerCase());
  });

  if (!items.length) {
    els.employeesList.className = "list empty";
    els.employeesList.textContent = "Nenhum funcionário encontrado.";
    return;
  }

  els.employeesList.className = "list";
  els.employeesList.innerHTML = items.map((emp) => `
    <div class="list-item">
      <div class="item-main">
        <strong>${escapeHtml(emp.nome || "Sem nome")}</strong>
        <span class="badge ${emp.ativo ? "ok" : "error"}">${emp.ativo ? "Ativo" : "Inativo"}</span>
      </div>
      <small>${formatCpf(emp.id)} • ${escapeHtml(emp.setor || "Sem setor")} • ${escapeHtml(emp.cargo || "Sem cargo")}</small>
      <div class="item-actions">
        <button class="btn ghost" type="button" data-edit-employee="${emp.id}">Editar</button>
      </div>
    </div>
  `).join("");

  $$('[data-edit-employee]').forEach((button) => {
    button.addEventListener("click", () => fillEmployeeForm(button.dataset.editEmployee));
  });
}

function fillEmployeeForm(cpf) {
  const emp = state.employees.find((item) => item.id === cpf);
  if (!emp) return;
  $("#empName").value = emp.nome || "";
  $("#empCpf").value = maskCpf(emp.id || emp.cpf || "");
  $("#empBirth").value = emp.nascimento || "";
  $("#empSector").value = emp.setor || "";
  $("#empRole").value = emp.cargo || "";
  $("#empActive").checked = emp.ativo !== false;
  showToast("Funcionário carregado para edição.");
}

function clearEmployeeForm() {
  $("#employeeForm").reset();
  $("#empActive").checked = true;
}

async function loadAdminPoints() {
  try {
    const q = query(collection(state.db, "pontos"), orderBy("createdAt", "desc"), limit(500));
    const snap = await getDocs(q);
    state.lastAdminPoints = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderAdminPoints();
  } catch (error) {
    console.error(error);
    showToast(formatFirebaseError(error), "error");
  }
}

function renderAdminPoints() {
  const start = $("#filterStart").value ? new Date(`${$("#filterStart").value}T00:00:00`) : null;
  const end = $("#filterEnd").value ? new Date(`${$("#filterEnd").value}T23:59:59`) : null;
  const term = $("#filterEmployee").value.trim().toLowerCase();

  const items = state.lastAdminPoints.filter((point) => {
    const pointDate = toDate(point.createdAt || point.dataHora);
    const target = `${point.funcionarioNome || ""} ${point.funcionarioCpf || ""}`.toLowerCase();
    if (start && pointDate && pointDate < start) return false;
    if (end && pointDate && pointDate > end) return false;
    if (term && !target.includes(term)) return false;
    return true;
  });

  if (!items.length) {
    els.pointsTableBody.innerHTML = `<tr><td colspan="5" class="center muted">Nenhum ponto encontrado.</td></tr>`;
    return;
  }

  els.pointsTableBody.innerHTML = items.map((point) => {
    const location = point.localizacao
      ? `<a href="https://www.google.com/maps?q=${point.localizacao.lat},${point.localizacao.lng}" target="_blank" rel="noopener">Abrir mapa</a><br><small>${point.localizacao.lat.toFixed(5)}, ${point.localizacao.lng.toFixed(5)}</small>`
      : "Sem localização";
    const photo = point.fotoUrl
      ? `<a href="${escapeAttribute(point.fotoUrl)}" target="_blank" rel="noopener">Ver foto</a>`
      : "Sem foto";

    return `
      <tr>
        <td>${formatTimestamp(point.createdAt || point.dataHora)}</td>
        <td><strong>${escapeHtml(point.funcionarioNome || "-")}</strong><br><small>${formatCpf(point.funcionarioCpf || "")}</small></td>
        <td>${tipoLabel(point.tipo)}</td>
        <td>${location}</td>
        <td>${photo}</td>
      </tr>
    `;
  }).join("");
}

function exportPointsCsv() {
  const rows = [["data_hora", "cpf", "funcionario", "setor", "cargo", "tipo", "latitude", "longitude", "precisao_metros", "foto"]];

  state.lastAdminPoints.forEach((point) => {
    rows.push([
      formatTimestamp(point.createdAt || point.dataHora),
      point.funcionarioCpf || "",
      point.funcionarioNome || "",
      point.setor || "",
      point.cargo || "",
      tipoLabel(point.tipo),
      point.localizacao?.lat ?? "",
      point.localizacao?.lng ?? "",
      point.localizacao?.accuracy ?? "",
      point.fotoUrl || ""
    ]);
  });

  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pontos-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function logoutAll() {
  try {
    await signOut(state.auth);
    state.currentFuncionario = null;
    state.currentAdmin = null;
    stopCamera();
    els.funcArea.classList.add("hidden");
    els.funcLoginCard.classList.remove("hidden");
    els.adminArea.classList.add("hidden");
    els.adminLoginCard.classList.remove("hidden");
    els.cameraStatus.textContent = "Não iniciada";
    els.locationStatus.textContent = "Não capturada";
    showToast("Sessão encerrada.");
  } catch (error) {
    console.error(error);
    showToast(formatFirebaseError(error), "error");
  }
}

function ensureFirebaseReady() {
  if (!state.auth || !state.db || !state.storage) {
    throw new Error("Firebase não configurado. Edite firebase-config.js com os dados do seu projeto.");
  }
}

function setBadge(text, type = "") {
  els.badge.textContent = text;
  els.badge.className = `badge ${type}`.trim();
}

function setFormLoading(form, loading) {
  form.querySelectorAll("button, input").forEach((el) => el.disabled = loading);
}

function showToast(message, type = "success") {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  els.toast.style.background = type === "error" ? "#b42318" : "#101828";
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add("hidden"), 5200);
}

function formatFirebaseError(error) {
  const message = error?.message || String(error);
  if (message.includes("permission-denied") || message.includes("Missing or insufficient permissions")) {
    return "Sem permissão no Firebase. Confira se as regras foram publicadas e se o usuário está liberado.";
  }
  if (message.includes("auth/invalid-credential") || message.includes("auth/wrong-password")) return "E-mail ou senha do admin incorretos.";
  if (message.includes("auth/user-not-found")) return "Usuário admin não encontrado.";
  if (message.includes("auth/operation-not-allowed")) return "Ative Email/Senha e Anonymous no Firebase Authentication.";
  return message;
}

function tipoLabel(tipo) {
  const labels = { entrada: "Entrada", pausa: "Pausa", retorno: "Retorno", saida: "Saída" };
  return labels[tipo] || tipo || "-";
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function onlyDigitsOrText(value) {
  return String(value || "").replace(/[.\-/]/g, "").trim();
}

function maskCpf(value) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatCpf(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return value || "-";
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function toDate(timestamp) {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate();
  if (timestamp instanceof Date) return timestamp;
  return new Date(timestamp);
}

function getMillis(timestamp) {
  const date = toDate(timestamp);
  return date ? date.getTime() : 0;
}

function formatTimestamp(timestamp) {
  const date = toDate(timestamp);
  if (!date || Number.isNaN(date.getTime())) return "Processando...";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function csvCell(value) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

init();

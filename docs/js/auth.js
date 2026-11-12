import { callApi, getSavedAuth, saveAuth } from "./api.js";

const form = document.getElementById("form-login");
const userInput = document.getElementById("login-user");
const passwordInput = document.getElementById("login-pass");
const submitButton = document.getElementById("btn-submit-login");
const toggleButton = document.getElementById("toggle-password");
const loadingOverlay = document.getElementById("loading-overlay");
const toastContainer = document.getElementById("toast-container");

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3500);
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  loadingOverlay.classList.toggle("active", isLoading);
}

toggleButton.addEventListener("click", () => {
  const shouldShow = passwordInput.type === "password";
  passwordInput.type = shouldShow ? "text" : "password";
  toggleButton.setAttribute("aria-pressed", String(shouldShow));
  toggleButton.setAttribute(
    "aria-label",
    shouldShow ? "Sembunyikan password" : "Tampilkan password",
  );
});

document.querySelectorAll("[data-support-link]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showToast("Silakan hubungi Ketua RT untuk bantuan akses akun.", "info");
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  setLoading(true);

  try {
    const authData = await callApi("login", {
      user: userInput.value.trim().toUpperCase(),
      password: passwordInput.value,
    });
    saveAuth(authData);
    window.location.replace("index.html");
  } catch (error) {
    showToast(error.message || "Login gagal. Silakan coba lagi.", "error");
    passwordInput.select();
  } finally {
    setLoading(false);
  }
});

if (getSavedAuth()?.token) {
  window.location.replace("index.html");
} else {
  userInput.focus();
}

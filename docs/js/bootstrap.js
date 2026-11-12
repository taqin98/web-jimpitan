async function loadFragments(container) {
  const fragmentPaths = container.dataset.fragments.split(",").map((path) => path.trim());
  const responses = await Promise.all(fragmentPaths.map((path) => fetch(path)));

  responses.forEach((response, index) => {
    if (!response.ok) {
      throw new Error(`Gagal memuat ${fragmentPaths[index]} (${response.status}).`);
    }
  });

  const fragments = await Promise.all(responses.map((response) => response.text()));
  // Static, same-origin HTML fragments maintained with this application.
  // eslint-disable-next-line no-restricted-properties
  container.innerHTML = fragments.join("\n");
}

function showBootstrapError() {
  const main = document.createElement("main");
  const title = document.createElement("h1");
  const message = document.createElement("p");
  const reloadButton = document.createElement("button");

  main.className = "bootstrap-error";
  title.textContent = "Aplikasi tidak dapat dimuat";
  message.textContent = "Periksa koneksi lalu muat ulang halaman.";
  reloadButton.className = "btn btn-primary";
  reloadButton.type = "button";
  reloadButton.textContent = "Muat Ulang";
  reloadButton.addEventListener("click", () => window.location.reload());

  main.append(title, message, reloadButton);
  document.body.replaceChildren(main);
}

async function bootstrap() {
  const containers = [...document.querySelectorAll("[data-fragments]")];

  try {
    await Promise.all(containers.map(loadFragments));
    await import("./app.js");
  } catch (error) {
    console.error(error);
    showBootstrapError();
  }
}

bootstrap();

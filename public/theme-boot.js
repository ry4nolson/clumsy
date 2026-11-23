(function () {
  var root = document.documentElement;
  var dark = false;
  try {
    dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch (error) {}
  var saved = null;
  try {
    saved = JSON.parse(window.localStorage.getItem("clumsy.themeBoot") || "null");
  } catch (error) {}
  if (!saved || typeof saved.id !== "string" || !saved.variables || (saved.base !== "light" && saved.base !== "dark")) {
    root.dataset.base = dark ? "dark" : "light";
    return;
  }
  root.dataset.base = saved.base;
  root.dataset.theme = saved.id;
  for (var name in saved.variables) {
    if (/^--[a-z-]+$/.test(name) && /^#[0-9a-f]{6}$/.test(saved.variables[name])) {
      root.style.setProperty(name, saved.variables[name]);
    }
  }
})();

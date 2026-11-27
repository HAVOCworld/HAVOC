let selectedType = "image";
const hints = { image:"Turn your imagination into an image.", song:"Describe the sound, mood, and style of your song.", video:"Describe the scene you want to bring to life." };
document.querySelectorAll(".type-tab").forEach(button => button.addEventListener("click", () => {
  selectedType = button.dataset.type;
  document.querySelectorAll(".type-tab").forEach(b => b.classList.toggle("selected", b === button));
  document.getElementById("type-hint").textContent = hints[selectedType];
}));
const result = document.getElementById("result");
document.getElementById("createBtn").addEventListener("click", async () => {
  const prompt = document.getElementById("prompt").value.trim();
  if (!prompt) { result.textContent = "Type a prompt first, then let HAVOC work its magic."; return; }
  result.textContent = "Sending your idea to HAVOC…";
  try {
    const response = await fetch("/api/create", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({type:selectedType,prompt}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    result.textContent = data.result?.url ? "Your creation is ready: " + data.result.url : JSON.stringify(data.result);
  } catch (error) { result.textContent = error.message; }
});
async function loadStats() {
  try {
    const response = await fetch("/api/visit");
    const data = await response.json();
    document.getElementById("totalVisits").textContent = Number(data.total).toLocaleString();
    document.getElementById("todayVisits").textContent = Number(data.today).toLocaleString();
  } catch {
    document.getElementById("totalVisits").textContent = "—";
    document.getElementById("todayVisits").textContent = "—";
  }
}
document.getElementById("premiumBtn").addEventListener("click", async () => {
  const button = document.getElementById("premiumBtn");
  button.disabled = true; button.textContent = "OPENING CHECKOUT…";
  try {
    const response = await fetch("/api/checkout", {method:"POST"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Checkout is unavailable.");
    location.href = data.url;
  } catch (error) { result.textContent = error.message; button.disabled = false; button.innerHTML = 'GET PRO <span>↗</span>'; }
});
document.getElementById("year").textContent = new Date().getFullYear();
loadStats();

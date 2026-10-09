const $ = (id) => document.getElementById(id);
const title = $("resultTitle");
const out = $("result");

const COLORS = {
  "жёлтый": "#f5c518", "зелёный": "#3aa655", "белый": "#ffffff", "красный": "#d93a2b",
  "синий": "#2d6cdf", "оранжевый": "#f08a24", "чёрный": "#1d1d1d", "фиолетовый": "#7d4cc9",
  "розовый": "#f07fb0", "серый": "#9a9a9a",
};

async function api(path, options) {
  const res = await fetch("/api" + path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Ошибка ${res.status}`);
  return data;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const grade = (g) => `<span class="grade">${esc(g)}</span>`;
const hold = (c) => `<span class="hold"><span class="dot" style="background:${COLORS[c] || "#ccc"}"></span>${esc(c)}</span>`;

function show(head, html) {
  title.textContent = head;
  out.innerHTML = html;
}
function showError(e) {
  out.innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
}

function routesTable(rows, extraCol) {
  if (!rows.length) return `<div class="msg">Ничего не нашлось</div>`;
  return `<table>
    <thead><tr><th>Кат.</th><th>Трасса</th><th>Цвет</th><th>Сектор</th><th>Накрутил</th><th>Дата</th><th>Пролазов</th>${extraCol ? "<th>" + extraCol.head + "</th>" : ""}</tr></thead>
    <tbody>${rows.map((r) => `
      <tr class="clickable" data-route="${r.id}" data-name="${esc(r.name)}">
        <td>${grade(r.grade)}</td><td><b>${esc(r.name)}</b></td><td>${hold(r.hold_color)}</td>
        <td>${esc(r.sector)} <span class="tag">${esc(r.discipline)}</span></td>
        <td>${esc(r.setter)}</td><td>${r.set_date}</td><td>${r.ascents}</td>
        ${extraCol ? "<td>" + extraCol.value(r) + "</td>" : ""}
      </tr>`).join("")}
    </tbody></table>
    <div id="ascents" class="sub"></div>`;
}

// клик по трассе показывает, кто её пролез
out.addEventListener("click", async (e) => {
  const tr = e.target.closest("tr[data-route]");
  if (!tr) return;
  const box = $("ascents");
  try {
    const rows = await api(`/routes/${tr.dataset.route}/ascents`);
    box.innerHTML = `<h3>Пролазы трассы «${tr.dataset.name}»</h3>` + (rows.length
      ? `<table><thead><tr><th>Скалолаз</th><th>Стиль</th><th>Дата</th></tr></thead><tbody>
         ${rows.map((a) => `<tr><td>${esc(a.climber)}</td><td>${a.style}</td><td>${a.date}</td></tr>`).join("")}
         </tbody></table>`
      : `<div class="msg">Эту трассу ещё никто не пролез. Твой шанс!</div>`);
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) { box.innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
});

const actions = {
  async routes() {
    const sel = $("sector");
    const rows = await api("/routes" + (sel.value ? `?sector_id=${sel.value}` : ""));
    show(`Трассы: ${sel.options[sel.selectedIndex].text}`, routesTable(rows));
  },

  async random() {
    const r = await api(`/routes/random?min_grade=${encodeURIComponent($("minGrade").value)}&max_grade=${encodeURIComponent($("maxGrade").value)}`);
    show("Сегодня лезешь", `
      <div class="big">
        ${grade(r.grade)}
        <div>
          <h3>${esc(r.name)}</h3>
          <div>${hold(r.hold_color)} · ${esc(r.sector)} (${esc(r.discipline)})</div>
          <div class="tag">накрутил ${esc(r.setter)} ${r.set_date} · пролазов: ${r.ascents}</div>
        </div>
      </div>`);
  },

  async fresh() {
    const days = $("freshDays").value;
    const rows = await api(`/routes/fresh?days=${days}`);
    show(`Накручено за ${days} дн.`, routesTable(rows, { head: "Дней назад", value: (r) => r.days_ago }));
  },

  async leaderboard() {
    const rows = await api("/leaderboard?days=30");
    const medal = ["🥇", "🥈", "🥉"];
    show("Рейтинг за 30 дней", `<table>
      <thead><tr><th>#</th><th>Скалолаз</th><th>Очки</th><th>Трасс</th><th>Лучшая кат.</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr>
        <td class="medal">${medal[i] || i + 1}</td><td><b>${esc(r.name)}</b></td>
        <td>${r.score}</td><td>${r.routes}</td><td>${grade(r.best_grade)}</td></tr>`).join("")}
      </tbody></table>`);
  },

  async stats() {
    const rows = await api("/stats/grades");
    const maxR = Math.max(...rows.map((r) => r.routes));
    const maxA = Math.max(...rows.map((r) => r.ascents), 1);
    show("Трассы и пролазы по категориям", `
      <div class="legend"><span>трасс на стене</span><span class="asc">пролазов</span></div>
      ${rows.map((r) => `<div class="bar-row">
        ${grade(r.grade)}
        <div class="bar-wrap"><div class="bar" style="width:${(r.routes / maxR) * 100}%"></div>${r.routes}</div>
        <div class="bar-wrap"><div class="bar asc" style="width:${(r.ascents / maxA) * 100}%"></div>${r.ascents}</div>
      </div>`).join("")}`);
  },

  async add() {
    const body = { climber: $("climber").value, route_id: Number($("route").value), style: $("style").value };
    const r = await api("/ascents", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    show("Пролаз записан", `<div class="msg ok">
      <b>${esc(r.climber)}</b> пролез «${esc(r.route)}» ${grade(r.grade)} стилем <b>${r.style}</b>. Запись №${r.id} сохранена в БД.
    </div>`);
    loadClimbers();
  },
};

document.querySelectorAll("button[data-action]").forEach((btn) =>
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try { await actions[btn.dataset.action](); } catch (e) { showError(e); }
    finally { btn.disabled = false; }
  }));

async function loadClimbers() {
  const list = await api("/climbers");
  $("climbers").innerHTML = list.map((c) => `<option value="${esc(c.name)}">`).join("");
}

async function init() {
  try {
    await api("/health");
    $("status").textContent = "БД подключена";
    $("status").className = "status ok";
  } catch {
    $("status").textContent = "API недоступен";
    $("status").className = "status bad";
    return;
  }
  const [sectors, grades, routes] = await Promise.all([api("/sectors"), api("/grades"), api("/routes")]);
  $("sector").innerHTML += sectors.map((s) => `<option value="${s.id}">${esc(s.name)} (${s.routes})</option>`).join("");
  const opts = grades.map((g) => `<option>${g.grade}</option>`).join("");
  $("minGrade").innerHTML = opts; $("maxGrade").innerHTML = opts;
  $("minGrade").value = "6a"; $("maxGrade").value = "6c+";
  $("route").innerHTML = routes.map((r) => `<option value="${r.id}">${r.grade} · ${esc(r.name)} (${esc(r.sector)})</option>`).join("");
  loadClimbers();
}

init();

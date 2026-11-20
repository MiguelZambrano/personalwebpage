(() => {
  const SHEET_ID = "1bkW1F3ymrEXjDdrKK374_5rbMxXPoDPInG02pyypy9Q";
  const urlCSV = (sheet) =>
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;

  const MESES_ES = [
    "enero","febrero","marzo","abril","mayo","junio",
    "julio","agosto","septiembre","octubre","noviembre","diciembre"
  ];

  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i + 1];
      if (inQuotes) {
        if (c === '"' && next === '"') { cell += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cell += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(cell.trim()); cell = ""; }
        else if (c === '\n' || c === '\r') {
          if (c === '\r' && next === '\n') i++;
          row.push(cell.trim());
          if (row.some(v => v !== "")) rows.push(row);
          row = []; cell = "";
        } else cell += c;
      }
    }
    if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
    return rows;
  }

  const toNum = (s) => {
    let clean = String(s || "0").replace(/[^0-9.,-]/g, "");
    if (clean.includes(",") && clean.includes(".")) {
      if (clean.lastIndexOf(",") > clean.lastIndexOf(".")) {
        clean = clean.replace(/\./g, "").replace(",", ".");
      } else {
        clean = clean.replace(/,/g, "");
      }
    } else if (clean.includes(",")) {
      clean = clean.replace(",", ".");
    }
    return parseFloat(clean) || 0;
  };

  const money = (n) => `$${n.toFixed(2)}`;
  const capitalizar = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";

  let chartInstance = null;

  async function init() {
    try {
      const [csvAportes, csvResumen] = await Promise.all([
        fetch(urlCSV("Aportes")).then(r => r.text()),
        fetch(urlCSV("Resumen")).then(r => r.text())
      ]);

      const rawAportes = parseCSV(csvAportes);
      const rawResumen = parseCSV(csvResumen);

      const headersA = rawAportes[0];
      const idxTotal = headersA.findIndex(h => h.toLowerCase() === "total");
      const meses = headersA.slice(1, idxTotal > 0 ? idxTotal : headersA.length);
      const personas = rawAportes.slice(1)
        .filter(r => r[0] && !r[0].toLowerCase().startsWith("total"))
        .map(r => {
          const pagos = Object.fromEntries(meses.map((m, i) => [m, (r[i + 1] || "").toUpperCase()]));
          const mesesPagados = meses.filter(m => pagos[m] === "TRUE");
          return {
            nombre: r[0],
            pagos,
            mesesPagados,
            total: idxTotal > 0 ? r[idxTotal] : `${mesesPagados.length} aportes.`
          };
        });

      let anio = parseInt((meses[0] || "").match(/\d{4}/)?.[0] || "2025", 10);
      const resumen = rawResumen.slice(1).filter(r => r[0]).map((r, idx) => {
        let mesLabel = capitalizar(r[0]);
        const matchAnio = mesLabel.match(/\d{4}/);
        let anioReg;
        if (matchAnio) {
          anioReg = matchAnio[0];
        } else {
          if (idx > 0 && mesLabel.toLowerCase().startsWith("enero")) anio++;
          anioReg = String(anio);
          mesLabel = `${mesLabel} ${anioReg}`;
        }
        return {
          mes: mesLabel,
          anio: anioReg,
          saldoAnt: toNum(r[1]),
          aportes: toNum(r[2]),
          botellones: r[3] === "" ? null : parseInt(r[3], 10),
          gastoAgua: toNum(r[4]),
          gastosVarios: toNum(r[5]),
          saldoFinal: toNum(r[6]),
          notas: (r[7] && r[7] !== "-") ? r[7] : ""
        };
      });

      const hoy = new Date();
      const anioHoy = String(hoy.getFullYear());
      const etiquetaHoy = `${MESES_ES[hoy.getMonth()]} ${anioHoy}`;
      const mesActual = meses.find(m => m.toLowerCase() === etiquetaHoy) || meses[meses.length - 1];

      const regActual = resumen.find(r => r.mes.toLowerCase() === mesActual.toLowerCase()) || resumen[resumen.length - 1];
      const ultimoReg = resumen[resumen.length - 1];
      const notaAdelanto = ultimoReg.mes !== regActual.mes
        ? `Con adelantos (${ultimoReg.mes}): ${money(ultimoReg.saldoFinal)}`
        : `Actualizado a ${regActual.mes}`;

      document.getElementById("agua-kpis").innerHTML = `
        <div class="agua-kpi">
          <small>Saldo disponible (${regActual.mes})</small>
          <strong>${money(regActual.saldoFinal)}</strong>
          <span>${notaAdelanto}</span>
        </div>
        <div class="agua-kpi">
          <small>Aportes del mes</small>
          <strong>${money(regActual.aportes)}</strong>
          <span>Gastos: ${money(regActual.gastoAgua + regActual.gastosVarios)}</span>
        </div>
        <div class="agua-kpi">
          <small>Botellones (${regActual.mes})</small>
          <strong>${regActual.botellones ?? 0}</strong>
          <span>Agua: ${money(regActual.gastoAgua)}</span>
        </div>
      `;

      const selMes = document.getElementById("select-mes");
      [...meses].reverse().forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        if (m === mesActual) opt.selected = true;
        selMes.appendChild(opt);
      });

      const renderAportes = () => {
        const m = selMes.value;
        const q = document.getElementById("buscar-nombre").value.toLowerCase().trim();
        const soloActivos = document.getElementById("solo-activos").checked;
        const cont = document.getElementById("lista-aportes");

        const filtrados = personas.filter(p => {
          const estado = p.pagos[m];
          if (soloActivos && estado !== "TRUE" && estado !== "FALSE") return false;
          if (q && !p.nombre.toLowerCase().includes(q)) return false;
          return true;
        });

        cont.innerHTML = filtrados.length ? filtrados.map(p => {
          const st = p.pagos[m];
          const badge = st === "TRUE"
            ? `<span class="agua-badge badge-ok">✓ Pagado</span>`
            : st === "FALSE"
              ? `<span class="agua-badge badge-pend">Pendiente</span>`
              : `<span class="agua-badge badge-na">No aplica</span>`;

          const chips = p.mesesPagados.length
            ? p.mesesPagados.map(mes => `<span class="agua-chip">✓ ${mes}</span>`).join("")
            : `<span class="agua-meta">Sin aportes registrados.</span>`;

          return `
            <details class="agua-item">
              <summary>
                <div class="agua-item-top">
                  <div class="agua-nombre-wrap">
                    <span class="agua-chevron">▶</span>
                    <strong>${p.nombre}</strong>
                  </div>
                  ${badge}
                </div>
                <div class="agua-meta">Acumulado histórico: ${p.total || "—"} · Toca para ver meses</div>
              </summary>
              <div class="agua-historial">
                <div class="agua-historial-titulo">Meses aportados (${p.mesesPagados.length}):</div>
                <div class="agua-chips">${chips}</div>
              </div>
            </details>
          `;
        }).join("") : `<div class="agua-item">No se encontraron personas con ese filtro.</div>`;
      };

      selMes.addEventListener("change", renderAportes);
      document.getElementById("buscar-nombre").addEventListener("input", renderAportes);
      document.getElementById("solo-activos").addEventListener("change", renderAportes);
      renderAportes();

      const aniosDisponibles = [...new Set(resumen.map(r => r.anio))].sort().reverse();
      const selAnio = document.getElementById("select-anio");

      aniosDisponibles.forEach(a => {
        const opt = document.createElement("option");
        opt.value = a;
        opt.textContent = `Año ${a}`;
        if (a === anioHoy) opt.selected = true;
        selAnio.appendChild(opt);
      });
      const optTodos = document.createElement("option");
      optTodos.value = "todos";
      optTodos.textContent = "Todos los años";
      selAnio.appendChild(optTodos);

      const renderResumen = () => {
        const filtroAnio = selAnio.value;
        const datos = filtroAnio === "todos"
          ? resumen
          : resumen.filter(r => r.anio === filtroAnio);

        document.getElementById("lista-resumen").innerHTML = [...datos].reverse().map(r => `
          <div class="agua-item">
            <div class="agua-item-top">
              <strong>${r.mes}</strong>
              <strong>Saldo: ${money(r.saldoFinal)}</strong>
            </div>
            <div class="agua-meta">
              Aportes: ${money(r.aportes)} · Botellones: ${r.botellones ?? "—"} (${money(r.gastoAgua)})
              ${r.gastosVarios > 0 ? ` · Varios: ${money(r.gastosVarios)}` : ""}
            </div>
            ${r.notas ? `<div class="agua-nota">${r.notas}</div>` : ""}
          </div>
        `).join("");

        if (chartInstance) chartInstance.destroy();
        chartInstance = new Chart(document.getElementById("grafico-saldo"), {
          type: "line",
          data: {
            labels: datos.map(r =>
              filtroAnio === "todos"
                ? r.mes.replace(/ 20(\d\d)/, " '$1")
                : r.mes.replace(/ \d{4}/, "")
            ),
            datasets: [{
              label: "Saldo final ($)",
              data: datos.map(r => r.saldoFinal),
              borderColor: "#1b6e4b",
              backgroundColor: "rgba(27, 110, 75, 0.15)",
              fill: true,
              tension: 0.3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
          }
        });
      };

      selAnio.addEventListener("change", renderResumen);
      renderResumen();

      document.querySelectorAll(".agua-tab").forEach(btn => {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".agua-tab, .agua-panel").forEach(el => el.classList.remove("active"));
          btn.classList.add("active");
          document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
        });
      });

      document.getElementById("agua-estado").style.display = "none";
      document.getElementById("agua-contenido").style.display = "block";
    } catch (err) {
      document.getElementById("agua-estado").textContent =
        "No se pudieron cargar los datos. Verifica que la hoja sea pública (Cualquier persona con el enlace puede ver).";
      console.error(err);
    }
  }

  init();
})();

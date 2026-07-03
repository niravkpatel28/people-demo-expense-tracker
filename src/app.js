const DATA_URL = "backend/expenses.json";

const CATEGORY_COLORS = {
  Food: "#AC75FF",
  Travel: "#899CFA",
  Bill: "#B0F7BA",
  Investment: "#654A8C",
  Medical: "#525B89",
  Entertainment: "#8A38F5",
  Education: "#D9C2FF",
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const shortDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const monthLabelFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });

const state = {
  expenses: [],
  selectedCategory: null,
};

const els = {
  dateRange: document.getElementById("dateRange"),
  totalAmount: document.getElementById("totalAmount"),
  totalDelta: document.getElementById("totalDelta"),
  clearFilter: document.getElementById("clearFilter"),
  clearFilterLabel: document.getElementById("clearFilterLabel"),
  trendChart: document.getElementById("trendChart"),
  categoryChart: document.getElementById("categoryChart"),
  transactionRows: document.getElementById("transactionRows"),
};

init();

async function init() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    state.expenses = await res.json();
    render();
  } catch (err) {
    els.totalAmount.textContent = "—";
    els.trendChart.innerHTML = `<p class="load-error">Couldn't load expense data.</p>`;
    console.error(err);
  }

  els.clearFilter.addEventListener("click", () => {
    state.selectedCategory = null;
    render();
  });
}

function render() {
  const filtered = state.selectedCategory
    ? state.expenses.filter((e) => e.category === state.selectedCategory)
    : state.expenses;

  renderDateRange();
  renderTotal(filtered);
  renderClearFilter();
  renderTrend(filtered);
  renderCategoryChart(state.expenses);
  renderTable(filtered);
}

function renderDateRange() {
  if (!state.expenses.length) return;
  const dates = state.expenses.map((e) => e.date_of_expense).sort();
  const start = shortDateFormatter.format(new Date(dates[0]));
  const end = shortDateFormatter.format(new Date(dates[dates.length - 1]));
  els.dateRange.textContent = `${start} – ${end}`;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function renderTotal(expenses) {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  els.totalAmount.textContent = currencyFormatter.format(total);

  const monthly = groupByMonth(expenses);
  // Exclude the current, still-in-progress month so we compare two full months.
  const fullMonths =
    monthly.length && monthly[monthly.length - 1].key === currentMonthKey()
      ? monthly.slice(0, -1)
      : monthly;

  if (fullMonths.length < 2) {
    els.totalDelta.textContent = "";
    return;
  }

  const last = fullMonths[fullMonths.length - 1].total;
  const prev = fullMonths[fullMonths.length - 2].total;
  const diffPct = prev === 0 ? 0 : ((last - prev) / prev) * 100;
  const arrow = diffPct >= 0 ? "▲" : "▼";
  const cls = diffPct >= 0 ? "is-up" : "is-down";
  const lastMonthLabel = monthLabelFormatter.format(fullMonths[fullMonths.length - 1].date);

  els.totalDelta.textContent = `${arrow} ${Math.abs(diffPct).toFixed(0)}% vs previous month (${lastMonthLabel})`;
  els.totalDelta.className = `metric-delta ${cls}`;
}

function renderClearFilter() {
  if (state.selectedCategory) {
    els.clearFilter.hidden = false;
    els.clearFilterLabel.textContent = state.selectedCategory;
  } else {
    els.clearFilter.hidden = true;
  }
}

function groupByMonth(expenses) {
  const map = new Map();
  for (const e of expenses) {
    const key = e.date_of_expense.slice(0, 7); // YYYY-MM
    map.set(key, (map.get(key) || 0) + e.amount);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, total]) => ({ key, total, date: new Date(`${key}-01T00:00:00`) }));
}

function renderTrend(expenses) {
  const monthly = groupByMonth(expenses);

  if (!monthly.length) {
    els.trendChart.innerHTML = `<p class="load-error">No data for this view.</p>`;
    return;
  }

  const width = 600;
  const height = 200;
  const padX = 28;
  const padTop = 34;
  const padBottom = 26;

  const maxVal = Math.max(...monthly.map((m) => m.total), 1);
  const innerWidth = width - padX * 2;
  const innerHeight = height - padTop - padBottom;

  const points = monthly.map((m, i) => {
    const x =
      monthly.length === 1 ? width / 2 : padX + (i / (monthly.length - 1)) * innerWidth;
    const y = padTop + innerHeight - (m.total / maxVal) * innerHeight;
    return { ...m, x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath =
    `M${points[0].x},${padTop + innerHeight} ` +
    points.map((p) => `L${p.x},${p.y}`).join(" ") +
    ` L${points[points.length - 1].x},${padTop + innerHeight} Z`;

  const gridLines = [0.25, 0.5, 0.75].map((t) => {
    const y = padTop + innerHeight * t;
    return `<line class="trend-gridline" x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}" />`;
  });

  const dots = points
    .map((p, i) => {
      const isLast = i === points.length - 1;
      return `<circle class="trend-dot${isLast ? " is-last" : ""}" cx="${p.x}" cy="${p.y}" r="${isLast ? 5 : 3.5}" />`;
    })
    .join("");

  const lastPoint = points[points.length - 1];
  const valueLabel = `<text class="trend-value-label" x="${lastPoint.x}" y="${lastPoint.y - 14}" text-anchor="${lastPoint.x > width - 60 ? "end" : "middle"}">${currencyFormatter.format(lastPoint.total)}</text>`;

  const axisLabels = points
    .map((p) => {
      const label = monthLabelFormatter.format(p.date);
      const suffix = p.key === currentMonthKey() ? " (MTD)" : "";
      return `<text class="trend-axis-label" x="${p.x}" y="${height - 6}" text-anchor="middle">${label}${suffix}</text>`;
    })
    .join("");

  els.trendChart.innerHTML = `
    <svg class="trend-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#AC75FF" stop-opacity="0.45" />
          <stop offset="100%" stop-color="#AC75FF" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${gridLines.join("")}
      <path class="trend-area" d="${areaPath}" />
      <path class="trend-line" d="${linePath}" />
      ${dots}
      ${valueLabel}
      ${axisLabels}
    </svg>
  `;
}

function renderCategoryChart(expenses) {
  const map = new Map();
  for (const e of expenses) {
    map.set(e.category, (map.get(e.category) || 0) + e.amount);
  }

  const totals = [...map.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  if (!totals.length) {
    els.categoryChart.innerHTML = `<p class="load-error">No data for this view.</p>`;
    return;
  }

  const maxVal = totals[0].total;

  els.categoryChart.innerHTML = `
    <div class="bar-chart">
      ${totals
        .map(({ category, total }) => {
          const pct = (total / maxVal) * 100;
          const isActive = state.selectedCategory === category;
          const isDimmed = state.selectedCategory && !isActive;
          const color = CATEGORY_COLORS[category] || "#AC75FF";
          return `
            <div class="bar-row${isActive ? " is-active" : ""}${isDimmed ? " is-dimmed" : ""}" data-category="${category}" role="button" tabindex="0">
              <span class="bar-label">${category}</span>
              <span class="bar-track">
                <span class="bar-fill" style="width:${pct}%; background:${color};"></span>
              </span>
              <span class="bar-value">${currencyFormatter.format(total)}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;

  els.categoryChart.querySelectorAll(".bar-row").forEach((row) => {
    const toggle = () => {
      const category = row.dataset.category;
      state.selectedCategory = state.selectedCategory === category ? null : category;
      render();
    };
    row.addEventListener("click", toggle);
    row.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        toggle();
      }
    });
  });
}

function renderTable(expenses) {
  const sorted = [...expenses].sort((a, b) =>
    b.date_of_expense.localeCompare(a.date_of_expense)
  );

  if (!sorted.length) {
    els.transactionRows.innerHTML = `<tr class="empty-row"><td colspan="4">No transactions in this view.</td></tr>`;
    return;
  }

  els.transactionRows.innerHTML = sorted
    .map((e) => {
      const color = CATEGORY_COLORS[e.category] || "#AC75FF";
      return `
        <tr>
          <td>${shortDateFormatter.format(new Date(e.date_of_expense))}</td>
          <td class="col-name">${e.name_of_expense}</td>
          <td>
            <span class="category-tag">
              <span class="category-dot" style="background:${color};"></span>
              ${e.category}
            </span>
          </td>
          <td class="col-amount">${currencyFormatter.format(e.amount)}</td>
        </tr>
      `;
    })
    .join("");
}

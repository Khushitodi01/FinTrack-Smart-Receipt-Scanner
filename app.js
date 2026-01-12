// app.js — FinTrack Smart Receipt Scanner (UPI removed, Clear All added)
// Replace your existing app.js with this full file.

// ---------- Configuration & storage ----------
const STORAGE_KEY = "fintrack_transactions_v2";
let transactions = loadTransactions();
let lastOcrText = "";
let chartInstance = null;
const DEFAULT_SAMPLE_PATH =
  window.SAMPLE_IMAGE_PATH || "/mnt/data/sample_pharmacy.png";

// ---------- DOM ----------
const txForm = document.getElementById("tx-form");
const amountInp = document.getElementById("amount");
const descInp = document.getElementById("desc");
const typeSel = document.getElementById("type");
const categorySel = document.getElementById("category");
const transactionsEl = document.getElementById("transactions");
const balanceEl = document.getElementById("balance");
const todaySpentEl = document.getElementById("today-spent");
const txCountEl = document.getElementById("tx-count");

const imageFileInput = document.getElementById("image-file");
const startOcrBtn = document.getElementById("start-ocr");
const useSampleBtn = document.getElementById("use-sample");
const showLastTextBtn = document.getElementById("show-last-text");
const ocrLogger = document.getElementById("ocr-logger");

const csvFileInput = document.getElementById("csvFile");
const importCsvBtn = document.getElementById("import-csv");
const clearAllBtn = document.getElementById("clear-all");

// ---------- Storage helpers ----------
function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}
function loadTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

// ---------- Add transaction (manual form) ----------
txForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const amt = parseFloat(amountInp.value);
  if (isNaN(amt) || amt <= 0) return alert("Enter valid amount");
  const tx = {
    id: Date.now(),
    type: typeSel.value,
    amount: amt,
    desc: descInp.value || (typeSel.value === "expense" ? "Expense" : "Income"),
    category: categorySel.value,
    date: new Date().toISOString(),
  };
  transactions.unshift(tx);
  saveTransactions();
  renderAll();
  txForm.reset();
});

// ---------- Render list, totals, chart ----------
function renderAll() {
  renderList();
  renderTotals();
  renderChart();
}

function renderList() {
  transactionsEl.innerHTML = "";
  if (transactions.length === 0) {
    transactionsEl.innerHTML =
      '<li class="small-muted">No transactions yet.</li>';
    txCountEl.textContent = "";
    return;
  }
  txCountEl.textContent = `(${transactions.length})`;
  transactions.forEach((tx, idx) => {
    const li = document.createElement("li");
    li.className = "tx-item";
    const left = document.createElement("div");
    left.innerHTML = `<strong>${escapeHtml(
      tx.desc
    )}</strong><br><small class="small-muted">${new Date(
      tx.date
    ).toLocaleString()}</small>`;
    const right = document.createElement("div");
    right.innerHTML = `<span>${tx.type === "expense" ? "-" : "+"} ₹${Number(
      tx.amount
    ).toFixed(2)}</span>`;

    const controls = document.createElement("div");
    controls.style.marginLeft = "12px";

    // Edit button
    const editBtn = document.createElement("button");
    editBtn.className = "btn small";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      const tx0 = transactions[idx];
      const newDesc = prompt("Edit description:", tx0.desc);
      if (newDesc === null) return;
      const newAmt = prompt("Edit amount:", tx0.amount);
      if (newAmt === null) return;
      const amtNum = parseFloat(newAmt);
      if (isNaN(amtNum) || amtNum <= 0) return alert("Invalid amount");
      tx0.desc = newDesc;
      tx0.amount = amtNum;
      saveTransactions();
      renderAll();
    });

    // Clear (trash) button
    const clearBtn = document.createElement("button");
    clearBtn.className = "btn small alt";
    clearBtn.innerHTML = "🗑️";
    clearBtn.title = "Delete transaction";
    clearBtn.style.marginLeft = "6px";
    clearBtn.style.background = "#2a2a2a";
    clearBtn.style.color = "#fff";
    clearBtn.addEventListener("click", () => {
      if (!confirm("Delete this transaction permanently?")) return;
      transactions.splice(idx, 1);
      saveTransactions();
      renderAll();
    });

    controls.appendChild(editBtn);
    controls.appendChild(clearBtn);

    li.appendChild(left);
    li.appendChild(right);
    li.appendChild(controls);
    transactionsEl.appendChild(li);
  });
}

/* Month-aware totals (this month) */
function renderTotals() {
  let monthBalance = 0;
  let monthSpent = 0;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  transactions.forEach((tx) => {
    const d = new Date(tx.date);
    if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
      if (tx.type === "expense") {
        monthBalance -= tx.amount;
        monthSpent += tx.amount;
      } else {
        monthBalance += tx.amount;
      }
    }
  });

  if (balanceEl) balanceEl.textContent = "₹" + monthBalance.toFixed(2);
  if (todaySpentEl) todaySpentEl.textContent = "₹" + monthSpent.toFixed(2);
}

function renderChart() {
  const now = new Date();
  const thisMonth = transactions.filter((tx) => {
    const d = new Date(tx.date);
    return (
      tx.type === "expense" &&
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth()
    );
  });
  const catMap = {};
  thisMonth.forEach((tx) => {
    catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount;
  });
  const labels = Object.keys(catMap);
  const data = labels.map((l) => catMap[l]);

  const ctx = document.getElementById("categoryChart").getContext("2d");
  if (chartInstance) chartInstance.destroy();
  const colors = [
  "#06b6d4",
  "#22c55e",
  "#f97316",
  "#eab308",
  "#a855f7",
  "#ef4444",
];

chartInstance = new Chart(ctx, {
  type: "doughnut",
  data: {
    labels,
    datasets: [
      {
        data,
        backgroundColor: colors.slice(0, labels.length),
      },
    ],
  },
  options: {
    responsive: true,
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: "#e6eef6" },
      },
    },
  },
});

}

// ---------- OCR / Preprocess ----------
async function preprocessImageToBlob(imgBlob, maxWidth = 1200) {
  const img = document.createElement("img");
  const url = URL.createObjectURL(imgBlob);
  await new Promise((res) => {
    img.onload = res;
    img.src = url;
  });
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const scale = Math.min(1, maxWidth / w);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // grayscale + contrast
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;
    gray = (gray - 128) * 1.2 + 128;
    if (gray < 0) gray = 0;
    if (gray > 255) gray = 255;
    d[i] = d[i + 1] = d[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);
  // threshold
  const imgData2 = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d2 = imgData2.data;
  for (let i = 0; i < d2.length; i += 4) {
    const g = d2[i];
    const v = g > 130 ? 255 : 0;
    d2[i] = d2[i + 1] = d2[i + 2] = v;
  }
  ctx.putImageData(imgData2, 0, 0);
  const processedBlob = await new Promise((res) =>
    canvas.toBlob(res, "image/jpeg", 0.9)
  );
  URL.revokeObjectURL(url);
  return processedBlob;
}

// ---------- OCR Worker (SINGLE INSTANCE) ----------
let ocrWorker = null;
let ocrInProgress = false;

async function getOcrWorker() {
  if (!ocrWorker) {
    ocrWorker = await Tesseract.createWorker({
      logger: (m) => {
        if (m.status === "recognizing text") {
          ocrLogger.textContent = `OCR: ${Math.round(m.progress * 100)}%`;
        }
      },
    });
    await ocrWorker.loadLanguage("eng");
    await ocrWorker.initialize("eng");
  }
  return ocrWorker;
}

// ---------- Safe OCR Runner ----------
async function runOcrOnFile(fileOrBlob) {
  if (ocrInProgress) {
    alert("OCR already running. Please wait.");
    return null;
  }

  try {
    ocrInProgress = true;
    startOcrBtn.disabled = true;

    ocrLogger.textContent = "Preprocessing image...";
    const blob = await preprocessImageToBlob(fileOrBlob);

    ocrLogger.textContent = "Running OCR...";
    const worker = await getOcrWorker();
    const {
      data: { text },
    } = await worker.recognize(blob);

    lastOcrText = text;
    ocrLogger.textContent = "OCR finished.";
    return text;
  } catch (err) {
    console.error(err);
    ocrLogger.textContent = "OCR failed.";
    alert("OCR failed. Try again.");
    return null;
  } finally {
    ocrInProgress = false;
    startOcrBtn.disabled = false;
  }
}


// ---------- Parsing extracted text ----------
function parseBillText(rawText) {
  let text = rawText || "";
  text = text.replace(/\r/g, "\n");
  text = text
    .replace(/O(?=\d)/g, "0")
    .replace(/l(?=\d)/g, "1")
    .replace(/,\s?/g, "");

  const out = { amount: null, date: null, merchant: null, note: null };

  // Specific parking/entry patterns (fix for your parking receipt)
  const parkingPatterns = [
    /Total\s*Entry\s*Fee\s*[:\-]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    /Entry\s*Fee\s*[:\-]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    /Total\s*Tariff\s*[:\-]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    /Tariff\s*[:\-]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    /Charges\s*[:\-]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
  ];
  for (const pat of parkingPatterns) {
    const m = pat.exec(text);
    if (m && m[1]) {
      out.amount = parseFloat(m[1]);
      break;
    }
  }

  // Amount patterns
  if (!out.amount) {
    const amountPatterns = [
      /₹\s?([0-9]+(?:[.,][0-9]{1,2})?)/g,
      /INR\s?([0-9]+(?:[.,][0-9]{1,2})?)/gi,
      /Total\s*[:\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i,
      /Amount\s*[:\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i,
      /Paid\s*[:\-]?\s*₹?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i,
    ];
    for (const pat of amountPatterns) {
      let m;
      while ((m = pat.exec(text)) !== null) {
        const val = parseFloat(m[1].replace(",", ""));
        if (!isNaN(val) && val > 0) {
          if (!out.amount || val > out.amount) out.amount = val;
        }
      }
    }
  }

  // Fallback: pick largest numeric value
  if (!out.amount) {
    const numPat = /([0-9]+(?:[.,][0-9]{1,2}))/g;
    let m;
    while ((m = numPat.exec(text)) !== null) {
      const val = parseFloat(m[1].replace(",", ""));
      if (!isNaN(val) && val > 0) {
        if (!out.amount || val > out.amount) out.amount = val;
      }
    }
  }

  // Date detection
  const datePatterns = [
    /([0-3]?\d[\/\-\.\s][0-1]?\d[\/\-\.\s](?:20|19)\d{2})/g,
    /((?:20|19)\d{2}[\/\-\.\s][0-1]?\d[\/\-\.\s][0-3]?\d)/g,
    /\b(0?[1-9]|[12][0-9]|3[01])\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b.*?([0-9]{4})/i,
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(0?[1-9]|[12][0-9]|3[01]),?\s*([0-9]{4})/i,
  ];
  for (const pat of datePatterns) {
    const m = pat.exec(text);
    if (m && m[1]) {
      const ds = m[1].replace(/\./g, "/").replace(/\s+/g, " ");
      const d = tryParseDate(ds);
      if (d) {
        out.date = d;
        break;
      }
    } else if (m) {
      try {
        const d = new Date(m[0]);
        if (!isNaN(d)) {
          out.date = d;
          break;
        }
      } catch (e) {}
    }
  }

  const lines = text
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  out.merchant = lines.length ? lines[0] : null;
  out.note = lines.slice(0, 5).join(" | ");
  return out;
}

function tryParseDate(s) {
  s = s.trim();
  const parts = s
    .split(/[\/\-\.\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const dt = new Date(
        `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`
      );
      if (!isNaN(dt)) return dt;
    } else {
      const dt = new Date(
        `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`
      );
      if (!isNaN(dt)) return dt;
    }
  }
  const dt2 = new Date(s);
  if (!isNaN(dt2)) return dt2;
  return null;
}

// ---------- OCR UI flow ----------
startOcrBtn.addEventListener("click", async () => {
  const file = imageFileInput.files[0];
  if (!file) return alert("Choose an image file first.");
  ocrLogger.textContent = "Preparing image...";
  const text = await runOcrOnFile(file);
  if (!text) return;
  handleExtractedText(text);
});

useSampleBtn.addEventListener("click", async () => {
  const samplePath = DEFAULT_SAMPLE_PATH;
  if (!samplePath) return alert("No sample path provided.");
  ocrLogger.textContent = "Loading sample image...";
  try {
    const resp = await fetch(samplePath);
    if (!resp.ok) throw new Error("Could not load sample image.");
    const blob = await resp.blob();
    ocrLogger.textContent = "Running OCR on sample image...";
    const text = await runOcrOnFile(blob);
    if (text) handleExtractedText(text);
  } catch (err) {
    console.error("Sample load error", err);
    alert("Could not load sample image: " + err.message);
    ocrLogger.textContent = "Sample load failed.";
  }
});

showLastTextBtn.addEventListener("click", () => {
  if (!lastOcrText) return alert("No OCR text available yet.");
  const preview = lastOcrText.slice(0, 3000);
  alert("Last OCR text (first 3000 chars):\n\n" + preview);
});

async function handleExtractedText(rawText) {
  const edited = prompt(
    "OCR extracted text (edit if needed). If OK, press OK to parse and add.",
    rawText.slice(0, 5000)
  );
  if (edited === null) {
    ocrLogger.textContent = "OCR cancelled by user.";
    return;
  }
  const parsed = parseBillText(edited);
  console.log("Parsed result:", parsed);
  if (!parsed.amount) {
    alert(
      "Could not detect an amount automatically. Please enter the amount manually in the Add form."
    );
    ocrLogger.textContent = "No amount found. Please add manually.";
    lastOcrText = rawText;
    return;
  }
  const tx = {
    id: Date.now() + Math.random(),
    type: "expense",
    amount: Math.round(parsed.amount * 100) / 100,
    desc: parsed.merchant || parsed.note || "Expense (from receipt)",
    category: categorize(parsed.merchant || parsed.note || ""),
    // date: parsed.date
    //   ? new Date(parsed.date).toISOString()
    //   : new Date().toISOString(),
    // NOTE: This logic saves the actual date detected from the receipt.
    date: new Date().toISOString(),

  };
  transactions.unshift(tx);
  saveTransactions();
  renderAll();
  ocrLogger.textContent = `Added ₹${tx.amount.toFixed(2)} — ${tx.desc}`;
  alert(`Added ₹${tx.amount.toFixed(2)} — ${tx.desc}`);
}

// ---------- Category mapping ----------
function categorize(text) {
  if (!text) return "other";
  const s = text.toLowerCase();
  if (
    s.includes("food") ||
    s.includes("restaurant") ||
    s.includes("cafe") ||
    s.includes("dine") ||
    s.includes("zomato") ||
    s.includes("swiggy")
  )
    return "food";
  if (
    s.includes("uber") ||
    s.includes("ola") ||
    s.includes("taxi") ||
    s.includes("bus") ||
    s.includes("metro") ||
    s.includes("petrol")
  )
    return "transport";
  if (
    s.includes("amazon") ||
    s.includes("flipkart") ||
    s.includes("myntra") ||
    s.includes("store") ||
    s.includes("shop")
  )
    return "shopping";
  if (s.includes("salary") || s.includes("payroll")) return "salary";
  if (s.includes("pharm") || s.includes("health") || s.includes("clinic"))
    return "health";
  return "other";
}

// ---------- CSV import ----------
importCsvBtn.addEventListener("click", () => {
  const file = csvFileInput.files[0];
  if (!file) return alert("Choose a CSV file first.");
  const reader = new FileReader();
  reader.onload = function (ev) {
    const text = ev.target.result;
    const rows = text.split(/\r?\n/).filter((r) => r.trim());
    if (rows.length < 2) return alert("CSV seems empty.");
    const headers = rows[0].split(",").map((h) => h.trim().toLowerCase());
    const dataRows = rows.slice(1);
    const newTx = [];
    dataRows.forEach((r) => {
      const cols = r.split(",");
      if (cols.length < headers.length) return;
      const obj = {};
      headers.forEach((h, i) => (obj[h] = (cols[i] || "").trim()));
      let amount = parseFloat(
        obj.amount ||
          obj.amt ||
          obj.transactionamount ||
          obj.credit ||
          obj.debit ||
          "0"
      );
      if (isNaN(amount)) return;
      let type = "expense";
      const dc = (
        obj.type ||
        obj["dr/cr"] ||
        obj.direction ||
        ""
      ).toLowerCase();
      if (dc.includes("cr") || dc.includes("credit")) type = "income";
      const desc =
        obj.description || obj.narration || obj.remark || obj.vpa || "Imported";
      const category = categorize(desc);
      const date = obj.date || obj.txndate || new Date().toISOString();
      newTx.push({
        id: Date.now() + Math.random(),
        type,
        amount,
        desc,
        category,
        date: new Date(date).toISOString(),
      });
    });
    if (newTx.length === 0) return alert("No transactions parsed from CSV.");
    transactions = newTx.concat(transactions);
    saveTransactions();
    renderAll();
    alert(`Imported ${newTx.length} transactions from CSV.`);
  };
  reader.readAsText(file);
});

// ---------- Clear All data (button) ----------
if (clearAllBtn) {
  clearAllBtn.addEventListener("click", () => {
    if (!confirm("This will DELETE all transactions permanently. Continue?"))
      return;
    localStorage.removeItem(STORAGE_KEY);
    transactions = [];
    saveTransactions();
    renderAll();
    alert("All transactions cleared.");
  });
}

// ---------- Helpers ----------
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        m
      ])
  );
}

// ---------- Initial render ----------
renderAll();

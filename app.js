/**
 * Dasbor Okupansi Tempat Tidur Rumah Sakit - Logika Aplikasi Utama
 * Pure Vanilla JavaScript (Tanpa pustaka, tanpa framework)
 */

// State Aplikasi Global
const state = {
  rawData: [],       // Data mentah hasil parsing
  filteredData: [],  // Data setelah pencarian
  tableData: [],     // Data setelah pencarian + pengurutann
  currentPage: 1,
  pageSize: 10,
  sortBy: 'Tanggal',
  sortOrder: 'asc', // 'asc' | 'desc'
  theme: 'dark'
};

// Kamus pemetaan header (mendukung header CSV bahasa Indonesia dan Inggris/Pengguna)
const headerMap = {
  'timestamp': 'Tanggal',
  'tanggal': 'Tanggal',
  'admissions': 'Pasien_Masuk',
  'pasien_masuk': 'Pasien_Masuk',
  'discharges': 'Pasien_Keluar',
  'pasien_keluar': 'Pasien_Keluar',
  'total_tempat_tidur': 'Total_Tempat_Tidur',
  'tempat_tidur_terisi': 'Tempat_Tidur_Terisi',
  'bed_occupancy': 'Okupansi',
  'okupansi': 'Okupansi',
  'staff_count': 'Staf',
  'staf': 'Staf',
  'flu_cases': 'Kasus_Flu',
  'kasus_flu': 'Kasus_Flu'
};

// Instansi canvas untuk grafik agar digambar ulang saat ukuran layar berubah
let chartInstances = {};

// ==========================================================================
// INISIALISASI & EVENT LISTENER
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initClock();
  initDragAndDrop();
  initTabNavigation();
  initTableControls();

  // Tombol Muat Data Sampel
  document.getElementById('loadSampleBtn').addEventListener('click', loadSampleData);

  // Handler Resize untuk membuat grafik Canvas manual responsif
  window.addEventListener('resize', debounce(() => {
    if (state.rawData.length > 0) {
      renderAllCharts();
    }
  }, 250));
});

// Helper Debounce untuk event resize
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Tampilan Jam di Navbar
function initClock() {
  const clockEl = document.getElementById('clockDisplay');
  const updateClock = () => {
    const now = new Date();
    const options = {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
    clockEl.textContent = now.toLocaleDateString('id-ID', options);
  };
  updateClock();
  setInterval(updateClock, 1000);
}

// Handler Toggle Tema
function initTheme() {
  const themeToggle = document.getElementById('themeToggle');
  const savedTheme = localStorage.getItem('theme') || 'dark';

  setTheme(savedTheme);

  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  });
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  state.theme = theme;

  // Gambar ulang grafik jika data ada agar sesuai dengan warna tema
  if (state.rawData.length > 0) {
    renderAllCharts();
  }
}

// Notifikasi Toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Toggle Spinner Loading
function showLoading(show) {
  document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

// Tampilkan informasi unggah file di bawah area unggah
function showUploadFileInfo(fileName, rowCount) {
  const infoDiv = document.getElementById('uploadFileInfo');
  const nameEl = document.getElementById('uploadFileName');
  if (infoDiv && nameEl) {
    nameEl.textContent = `${fileName}  —  ${rowCount} baris data`;
    infoDiv.style.display = 'flex';
  }
}

// ==========================================================================
// HANDLER DRAG & DROP & UNGGAH FILE
// ==========================================================================
function initDragAndDrop() {
  const uploadArea = document.getElementById('uploadArea');
  const csvInput = document.getElementById('csvInput');

  uploadArea.addEventListener('click', () => csvInput.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');

    if (e.dataTransfer.files.length > 0) {
      handleCsvFile(e.dataTransfer.files[0]);
    }
  });

  csvInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleCsvFile(e.target.files[0]);
    }
  });
}

// Parse File CSV
function handleCsvFile(file) {
  if (!file.name.endsWith('.csv')) {
    showToast('File harus bertipe CSV!', 'error');
    return;
  }

  showLoading(true);
  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    parseCSV(text, file.name);
  };
  reader.onerror = function () {
    showLoading(false);
    showToast('Gagal membaca file CSV.', 'error');
  };
  reader.readAsText(file);
}

// Helper untuk mem-parse angka yang mendukung desimal titik dan koma
function parseNumber(val) {
  if (val === undefined || val === null) return 0;
  let clean = val.toString().replace(/,/g, '.').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function parseCSV(text, fileName = 'Data CSV') {
  try {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) {
      throw new Error('CSV tidak memiliki baris data yang cukup.');
    }

    // Deteksi otomatis pembatas CSV (titik koma vs koma)
    let delimiter = ',';
    const firstLine = lines[0];
    const commas = (firstLine.match(/,/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    if (semicolons > commas) {
      delimiter = ';';
    }

    // Parse Header
    const rawHeaders = parseCsvLine(firstLine, delimiter);
    const colIndices = {};

    // Petakan header ke nama field standar
    rawHeaders.forEach((header, idx) => {
      const cleanH = header.trim().toLowerCase().replace(/^["']|["']$/g, '');
      if (headerMap[cleanH]) {
        colIndices[headerMap[cleanH]] = idx;
      }
    });

    // Validasi Kolom Wajib
    const required = ['Tanggal', 'Pasien_Masuk', 'Pasien_Keluar'];
    required.forEach(field => {
      if (colIndices[field] === undefined) {
        throw new Error(`Kolom wajib tidak ditemukan: "${field}" (atau variannya)`);
      }
    });

    // Kita harus memiliki setidaknya indikator Okupansi ATAU jumlah tempat tidur untuk menghitung tingkat okupansi
    const hasOccupancyField = colIndices['Okupansi'] !== undefined;
    const hasBedsField = colIndices['Total_Tempat_Tidur'] !== undefined && colIndices['Tempat_Tidur_Terisi'] !== undefined;

    if (!hasOccupancyField && !hasBedsField) {
      throw new Error('CSV harus memuat kolom "bed_occupancy" (atau "okupansi") ATAU kolom kapasitas ("total_tempat_tidur" & "tempat_tidur_terisi")');
    }

    const parsedRows = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = parseCsvLine(line, delimiter);
      if (cols.length < rawHeaders.length) continue;

      const row = {};

      // String Tanggal
      row.Tanggal = cols[colIndices['Tanggal']].trim();

      // Pasien Masuk & Keluar
      row.Pasien_Masuk = Math.round(parseNumber(cols[colIndices['Pasien_Masuk']]));
      row.Pasien_Keluar = Math.round(parseNumber(cols[colIndices['Pasien_Keluar']]));

      // Jumlah Staf (opsional)
      if (colIndices['Staf'] !== undefined) {
        row.Staf = Math.round(parseNumber(cols[colIndices['Staf']]));
      }

      // Kasus Flu (opsional)
      if (colIndices['Kasus_Flu'] !== undefined) {
        row.Kasus_Flu = Math.round(parseNumber(cols[colIndices['Kasus_Flu']]));
      }

      // Detail kapasitas tempat tidur (opsional)
      let totalTT = 0;
      let ttTerisi = 0;
      if (colIndices['Total_Tempat_Tidur'] !== undefined) {
        totalTT = Math.round(parseNumber(cols[colIndices['Total_Tempat_Tidur']]));
        row.Total_Tempat_Tidur = totalTT;
      }
      if (colIndices['Tempat_Tidur_Terisi'] !== undefined) {
        ttTerisi = Math.round(parseNumber(cols[colIndices['Tempat_Tidur_Terisi']]));
        row.Tempat_Tidur_Terisi = ttTerisi;
      }

      // Persentase okupansi
      let okupansi = 0;
      if (hasOccupancyField) {
        okupansi = parseNumber(cols[colIndices['Okupansi']]);
      } else if (totalTT > 0) {
        okupansi = (ttTerisi / totalTT) * 100;
      }
      // Preserve original occupancy value without rounding
      row.Okupansi = typeof okupansi === 'number' ? okupansi : parseFloat(okupansi);

      // Tentukan Kategori
      let kategori = 'Normal';
      if (row.Okupansi < 60) kategori = 'Rendah';
      else if (row.Okupansi > 85) kategori = 'Tinggi';
      row.Kategori = kategori;

      parsedRows.push(row);
    }

    if (parsedRows.length === 0) {
      throw new Error('Tidak ada data valid yang berhasil diproses dari CSV.');
    }

    // Urutkan baris secara kronologis
    parsedRows.sort((a, b) => new Date(a.Tanggal) - new Date(b.Tanggal));

    // Atur State
    state.rawData = parsedRows;
    state.filteredData = [...parsedRows];
    state.tableData = [...parsedRows];
    state.currentPage = 1;
    state.sortBy = 'Tanggal';
    state.sortOrder = 'asc';

    // Tampilkan Dasbor
    document.getElementById('dashboardContainer').style.display = 'block';

    // Tampilkan info file unggahan
    showUploadFileInfo(fileName, parsedRows.length);

    // Render header tabel dinamis
    renderTableHeader();

    // Proses Semua Data
    processDashboardData();
    showToast(`Berhasil memuat ${parsedRows.length} baris data.`, 'success');

    // Gulir
    document.getElementById('dashboardContainer').scrollIntoView({ behavior: 'smooth' });

  } catch (error) {
    showToast(error.message, 'error');
    console.error(error);
  } finally {
    showLoading(false);
  }
}

// Memisahkan kolom CSV dengan menghormati nilai yang dikutip dan pembatas khusus
function parseCsvLine(line, delimiter = ',') {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.replace(/^["']|["']$/g, '').trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.replace(/^["']|["']$/g, '').trim());
  return result;
}

// Membuat dan Memuat Data Sampel yang Realistis
function loadSampleData() {
  showLoading(true);
  setTimeout(() => {
    const rows = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateString = date.toISOString().split('T')[0];

      const totalTT = 150;
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      const baseOccRate = isWeekend ? 0.55 + Math.random() * 0.15 : 0.65 + Math.random() * 0.25;
      const ttTerisi = Math.round(totalTT * baseOccRate);

      const pasienMasuk = Math.round(15 + Math.random() * 20 + (isWeekend ? -10 : 5));
      const pasienKeluar = Math.round(12 + Math.random() * 20 + (isWeekend ? -8 : 3));

      const okupansi = parseFloat(((ttTerisi / totalTT) * 100).toFixed(2));
      let kategori = 'Normal';
      if (okupansi < 60) kategori = 'Rendah';
      else if (okupansi > 85) kategori = 'Tinggi';

      rows.push({
        Tanggal: dateString,
        Pasien_Masuk: pasienMasuk,
        Pasien_Keluar: pasienKeluar,
        Total_Tempat_Tidur: totalTT,
        Tempat_Tidur_Terisi: ttTerisi,
        Okupansi: okupansi,
        Kategori: kategori
      });
    }

    state.rawData = rows;
    state.filteredData = [...rows];
    state.tableData = [...rows];
    state.currentPage = 1;
    state.sortBy = 'Tanggal';
    state.sortOrder = 'asc';

    document.getElementById('dashboardContainer').style.display = 'block';

    // Tampilkan info file unggahan untuk data sampel
    showUploadFileInfo('Data Sampel (30 hari)', rows.length);

    renderTableHeader();
    processDashboardData();

    showToast('Data sampel berhasil dibuat dan dimuat!', 'success');
    showLoading(false);

    document.getElementById('dashboardContainer').scrollIntoView({ behavior: 'smooth' });
  }, 600);
}

// ==========================================================================
// NAVIGASI & KONTROL TAB
// ==========================================================================
function initTabNavigation() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const tabId = tab.getAttribute('data-tab');
      const contents = document.querySelectorAll('.tab-content');
      contents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `tab-content-${tabId}`) {
          content.classList.add('active');
        }
      });

      if (tabId === 'charts' && state.rawData.length > 0) {
        renderAllCharts();
      }
    });
  });
}

// ==========================================================================
// PERHITUNGAN MATEMATIKA STATISTIK (MANUAL)
// ==========================================================================
function calcMean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function calcMedian(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calcMode(arr) {
  if (arr.length === 0) return 0;
  const freq = {};
  let maxFreq = 0;
  let modes = [];

  arr.forEach(val => {
    const key = parseFloat(val.toFixed(6));
    freq[key] = (freq[key] || 0) + 1;
    if (freq[key] > maxFreq) {
      maxFreq = freq[key];
    }
  });

  for (const val in freq) {
    if (freq[val] === maxFreq) {
      modes.push(Number(val));
    }
  }

  // Mengambil nilai modus yang pertama kali muncul dalam array (seperti rumus MODE / MODE.SNGL di Excel)
  let firstMode = modes[0];
  let firstIndex = arr.indexOf(firstMode);
  for (let i = 1; i < modes.length; i++) {
    const idx = arr.indexOf(modes[i]);
    if (idx < firstIndex) {
      firstIndex = idx;
      firstMode = modes[i];
    }
  }
  return firstMode;
}

function calcVariance(arr, mean) {
  if (arr.length <= 1) return 0;
  const avg = mean !== undefined ? mean : calcMean(arr);
  const sumSqDiff = arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0);
  return sumSqDiff / (arr.length - 1);
}

function calcStdDev(variance) {
  return Math.sqrt(variance);
}

// Korelasi Pearson Manual
function calcPearsonCorrelation(x, y) {
  const n = x.length;
  if (n === 0 || n !== y.length) return 0;

  const meanX = calcMean(x);
  const meanY = calcMean(y);

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    num += diffX * diffY;
    denX += diffX * diffX;
    denY += diffY * diffY;
  }

  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

// Moving Average: secara adaptif menggunakan ukuran window 168 untuk data per jam atau 7 untuk data harian
function calcMovingAverage7Day(data) {
  const ma = [];
  const windowSize = data.length >= 168 ? 168 : 7;

  for (let i = 0; i < data.length; i++) {
    if (i < windowSize - 1) {
      const subset = data.slice(0, i + 1).map(d => d.Okupansi);
      ma.push(calcMean(subset));
    } else {
      const subset = data.slice(i - (windowSize - 1), i + 1).map(d => d.Okupansi);
      ma.push(calcMean(subset));
    }
  }
  return ma;
}

// ==========================================================================
// PROSESOR DATA INTI & INISIATOR RENDER
// ==========================================================================
function processDashboardData() {
  renderKPIs();
  renderStatisticsTab();
  renderOccupancyAnalysisTab();
  applyTableFilterAndSearch();
  renderInsightsTab();
  renderAllCharts();
}

// Render Kartu Header (KPI)
function renderKPIs() {
  const totalDays = state.rawData.length;
  const okupansis = state.rawData.map(d => d.Okupansi);
  const avgOcc = calcMean(okupansis);
  const maxOcc = Math.max(...okupansis);

  const lowDays = state.rawData.filter(d => d.Kategori === 'Rendah').length;
  const normalDays = state.rawData.filter(d => d.Kategori === 'Normal').length;
  const highDays = state.rawData.filter(d => d.Kategori === 'Tinggi').length;

  document.getElementById('kpiTotalDaysVal').textContent = totalDays;
  // Display average and max occupancy with full precision
  document.getElementById('kpiAvgOccVal').textContent = `${avgOcc.toFixed(2).replace('.', ',')}%`;
  document.getElementById('kpiMaxOccVal').textContent = `${maxOcc.toFixed(2).replace('.', ',')}%`;
  document.getElementById('kpiLowDaysVal').textContent = lowDays;
  document.getElementById('kpiNormalDaysVal').textContent = normalDays;
  document.getElementById('kpiHighDaysVal').textContent = highDays;

  // Hapus kartu tambahan jika ada
  const existingStaff = document.getElementById('kpiStaff');
  if (existingStaff) existingStaff.remove();
  const existingFlu = document.getElementById('kpiFlu');
  if (existingFlu) existingFlu.remove();
}

// Render Tab Perhitungan Statistik
function renderStatisticsTab() {
  const statsGrid = document.getElementById('statsGrid');

  const extractAndCompute = (label, key, unit = '') => {
    const vals = state.rawData.map(d => d[key]);
    const mean = calcMean(vals);
    const median = calcMedian(vals);
    const mode = calcMode(vals);
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    const variance = calcVariance(vals, mean);
    const stdDev = calcStdDev(variance);

    // Helper untuk memformat angka dengan format Indonesia (koma untuk desimal)
    // dan jumlah desimal yang tepat sesuai dengan rumus standar Excel
    const formatIndo = (num, decimals) => {
      if (num === undefined || num === null || isNaN(num)) return '-';
      return num.toLocaleString('id-ID', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    };

    return `
      <div class="stat-box">
        <h3 class="stat-box-title">${label}</h3>
        <div class="stat-list">
          <div class="stat-row"><span class="stat-name">Mean (Rata-rata)</span><span class="stat-value">${formatIndo(mean, 2)}${unit}</span></div>
          <div class="stat-row"><span class="stat-name">Median</span><span class="stat-value">${formatIndo(median, 2)}${unit}</span></div>
          <div class="stat-row"><span class="stat-name">Modus</span><span class="stat-value">${formatIndo(mode, 2)}${unit}</span></div>
          <div class="stat-row"><span class="stat-name">Nilai Minimum (Min)</span><span class="stat-value">${formatIndo(minVal, 2)}${unit}</span></div>
          <div class="stat-row"><span class="stat-name">Nilai Maksimum (Max)</span><span class="stat-value">${formatIndo(maxVal, 2)}${unit}</span></div>

          <div class="stat-row"><span class="stat-name">Standar Deviasi</span><span class="stat-value">${formatIndo(stdDev, 2)}${unit}</span></div>
        </div>
      </div>
    `;
  };

  let html = '';
  html += extractAndCompute('Okupansi (%)', 'Okupansi', '%');
  statsGrid.innerHTML = html;

  // Korelasi Pearson (Hanya dijalankan jika elemen matriks korelasi ada di DOM)
  const corrMatrixEl = document.getElementById('correlationMatrix');
  if (corrMatrixEl) {
    const dates = state.rawData;
    const occVals = dates.map(d => d.Okupansi);
    const inVals = dates.map(d => d.Pasien_Masuk);
    const outVals = dates.map(d => d.Pasien_Keluar);

    const corrInOut = calcPearsonCorrelation(inVals, outVals);
    const corrInOcc = calcPearsonCorrelation(inVals, occVals);
    const corrOutOcc = calcPearsonCorrelation(outVals, occVals);

    const getCorrBadge = (r) => {
      const abs = Math.abs(r);
      let desc = 'Sangat Lemah';
      let color = 'var(--text-muted)';
      let bg = 'var(--bg-tertiary)';

      if (abs >= 0.7) {
        desc = 'Kuat';
        color = r > 0 ? 'var(--success)' : 'var(--danger)';
        bg = r > 0 ? 'var(--success-glow)' : 'var(--danger-glow)';
      } else if (abs >= 0.4) {
        desc = 'Sedang';
        color = 'var(--warning)';
        bg = 'var(--warning-glow)';
      }
      return `<span class="matrix-value" style="color: ${color}; background-color: ${bg}">${r.toFixed(3)} (${desc})</span>`;
    };

    let matrixHtml = `
      <div class="matrix-row">
        <span class="matrix-label">Pasien Masuk vs Pasien Keluar</span>
        ${getCorrBadge(corrInOut)}
      </div>
      <div class="matrix-row">
        <span class="matrix-label">Pasien Masuk vs Okupansi</span>
        ${getCorrBadge(corrInOcc)}
      </div>
      <div class="matrix-row">
        <span class="matrix-label">Pasien Keluar vs Okupansi</span>
        ${getCorrBadge(corrOutOcc)}
      </div>
    `;

    const hasStaff = state.rawData.length > 0 && state.rawData[0].Staf !== undefined;
    const hasFlu = state.rawData.length > 0 && state.rawData[0].Kasus_Flu !== undefined;

    if (hasStaff) {
      const staffVals = dates.map(d => d.Staf);
      const corrStaffOcc = calcPearsonCorrelation(staffVals, occVals);
      matrixHtml += `
        <div class="matrix-row">
          <span class="matrix-label">Jumlah Staf vs Okupansi</span>
          ${getCorrBadge(corrStaffOcc)}
        </div>
      `;
    }
    if (hasFlu) {
      const fluVals = dates.map(d => d.Kasus_Flu);
      const corrFluOcc = calcPearsonCorrelation(fluVals, occVals);
      matrixHtml += `
        <div class="matrix-row">
          <span class="matrix-label">Kasus Flu vs Okupansi</span>
          ${getCorrBadge(corrFluOcc)}
        </div>
      `;
    }

    corrMatrixEl.innerHTML = matrixHtml;
  }
}

// Render Tab Daftar Kategori (daftar Rendah, Normal, Tinggi)
function renderOccupancyAnalysisTab() {
  const lowList = document.getElementById('analysisList-low');
  const normalList = document.getElementById('analysisList-normal');
  const highList = document.getElementById('analysisList-high');

  const lowDays = state.rawData.filter(d => d.Kategori === 'Rendah');
  const normalDays = state.rawData.filter(d => d.Kategori === 'Normal');
  const highDays = state.rawData.filter(d => d.Kategori === 'Tinggi');

  document.getElementById('countLow').textContent = `${lowDays.length} titik`;
  document.getElementById('countNormal').textContent = `${normalDays.length} titik`;
  document.getElementById('countHigh').textContent = `${highDays.length} titik`;

  const generateListHtml = (list) => {
    if (list.length === 0) {
      return '<p style="color:var(--text-muted); font-size:0.875rem; text-align:center; padding:1.5rem 0;">Tidak ada data kategori ini.</p>';
    }
    const hasBeds = list[0].Total_Tempat_Tidur !== undefined;
    return list.map(item => {
      const bedDetail = hasBeds ? ` (${item.Tempat_Tidur_Terisi}/${item.Total_Tempat_Tidur} TT)` : '';
      return `
        <div class="analysis-item">
          <span class="analysis-item-date">${item.Tanggal}</span>
          <span class="analysis-item-val">${item.Okupansi}%${bedDetail}</span>
        </div>
      `;
    }).join('');
  };

  lowList.innerHTML = generateListHtml(lowDays);
  normalList.innerHTML = generateListHtml(normalDays);
  highList.innerHTML = generateListHtml(highDays);
}

// ==========================================================================
// LOGIKA TABEL DATA (HEADER DINAMIS, PENCARIAN, PENGURUTAN, PAGINASI, EKSPOR)
// ==========================================================================
function initTableControls() {
  const searchInput = document.getElementById('tableSearch');
  const pageSizeSelect = document.getElementById('pageSizeSelect');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');

  searchInput.addEventListener('input', () => {
    state.currentPage = 1;
    applyTableFilterAndSearch();
  });

  pageSizeSelect.addEventListener('change', (e) => {
    state.pageSize = parseInt(e.target.value);
    state.currentPage = 1;
    renderTable();
  });

  btnPrevPage.addEventListener('click', () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      renderTable();
    }
  });

  btnNextPage.addEventListener('click', () => {
    const totalPages = Math.ceil(state.tableData.length / state.pageSize);
    if (state.currentPage < totalPages) {
      state.currentPage++;
      renderTable();
    }
  });

  document.getElementById('exportCsvBtn').addEventListener('click', exportTableToCSV);
}

function renderTableHeader() {
  const headerEl = document.getElementById('tableHeader');
  if (!headerEl) return;

  const hasStaff = state.rawData.length > 0 && state.rawData[0].Staf !== undefined;
  const hasFlu = state.rawData.length > 0 && state.rawData[0].Kasus_Flu !== undefined;
  const hasBeds = state.rawData.length > 0 && state.rawData[0].Total_Tempat_Tidur !== undefined;

  let html = `<tr>`;
  html += `<th class="sortable" data-col="Tanggal">Tanggal / Waktu <span class="sort-icon">${state.sortBy === 'Tanggal' ? (state.sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span></th>`;
  html += `<th class="sortable" data-col="Pasien_Masuk">Masuk <span class="sort-icon">${state.sortBy === 'Pasien_Masuk' ? (state.sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span></th>`;
  html += `<th class="sortable" data-col="Pasien_Keluar">Keluar <span class="sort-icon">${state.sortBy === 'Pasien_Keluar' ? (state.sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span></th>`;

  if (hasBeds) {
    html += `<th class="sortable" data-col="Total_Tempat_Tidur">Total TT <span class="sort-icon">${state.sortBy === 'Total_Tempat_Tidur' ? (state.sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span></th>`;
    html += `<th class="sortable" data-col="Tempat_Tidur_Terisi">TT Terisi <span class="sort-icon">${state.sortBy === 'Tempat_Tidur_Terisi' ? (state.sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span></th>`;
  }
  if (hasStaff) {
    html += `<th class="sortable" data-col="Staf">Staf <span class="sort-icon">${state.sortBy === 'Staf' ? (state.sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span></th>`;
  }
  if (hasFlu) {
    html += `<th class="sortable" data-col="Kasus_Flu">Kasus Flu <span class="sort-icon">${state.sortBy === 'Kasus_Flu' ? (state.sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span></th>`;
  }

  html += `<th class="sortable" data-col="Okupansi">Okupansi % <span class="sort-icon">${state.sortBy === 'Okupansi' ? (state.sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span></th>`;
  html += `<th>Kategori</th>`;
  html += `</tr>`;

  headerEl.innerHTML = html;

  // Pasang fungsi pengurutan (sorter)
  const headers = headerEl.querySelectorAll('th.sortable');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const colName = header.getAttribute('data-col');
      if (state.sortBy === colName) {
        state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortBy = colName;
        state.sortOrder = 'asc';
      }
      applyTableSorting();
      renderTableHeader();
      renderTable();
    });
  });
}

function applyTableFilterAndSearch() {
  const query = document.getElementById('tableSearch').value.toLowerCase().trim();

  if (!query) {
    state.filteredData = [...state.rawData];
  } else {
    state.filteredData = state.rawData.filter(row => {
      const matchesSearch =
        row.Tanggal.toLowerCase().includes(query) ||
        row.Pasien_Masuk.toString().includes(query) ||
        row.Pasien_Keluar.toString().includes(query) ||
        row.Okupansi.toString().includes(query) ||
        row.Kategori.toLowerCase().includes(query) ||
        (row.Staf && row.Staf.toString().includes(query)) ||
        (row.Kasus_Flu && row.Kasus_Flu.toString().includes(query));
      return matchesSearch;
    });
  }

  applyTableSorting();
  renderTable();
}

function applyTableSorting() {
  const col = state.sortBy;
  const isAsc = state.sortOrder === 'asc';

  state.tableData = [...state.filteredData].sort((a, b) => {
    let valA = a[col];
    let valB = b[col];

    if (valA === undefined) valA = 0;
    if (valB === undefined) valB = 0;

    if (col === 'Tanggal') {
      valA = new Date(valA);
      valB = new Date(valB);
    }

    if (valA < valB) return isAsc ? -1 : 1;
    if (valA > valB) return isAsc ? 1 : -1;
    return 0;
  });
}

function renderTable() {
  const tableBody = document.getElementById('tableBody');
  tableBody.innerHTML = '';

  const start = (state.currentPage - 1) * state.pageSize;
  const end = Math.min(start + state.pageSize, state.tableData.length);
  const pageItems = state.tableData.slice(start, end);

  const hasStaff = state.rawData.length > 0 && state.rawData[0].Staf !== undefined;
  const hasFlu = state.rawData.length > 0 && state.rawData[0].Kasus_Flu !== undefined;
  const hasBeds = state.rawData.length > 0 && state.rawData[0].Total_Tempat_Tidur !== undefined;

  if (pageItems.length === 0) {
    let colSpan = 5;
    if (hasBeds) colSpan += 2;
    if (hasStaff) colSpan++;
    if (hasFlu) colSpan++;

    tableBody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding:2rem; color:var(--text-muted)">Data tidak ditemukan.</td></tr>`;
    updatePaginationControls(0);
    return;
  }

  pageItems.forEach(row => {
    let pillClass = 'pill-normal';
    if (row.Kategori === 'Rendah') pillClass = 'pill-low';
    if (row.Kategori === 'Tinggi') pillClass = 'pill-high';

    const tr = document.createElement('tr');

    let html = `<td><strong>${row.Tanggal}</strong></td>`;
    html += `<td>${row.Pasien_Masuk}</td>`;
    html += `<td>${row.Pasien_Keluar}</td>`;

    if (hasBeds) {
      html += `<td>${row.Total_Tempat_Tidur}</td>`;
      html += `<td>${row.Tempat_Tidur_Terisi}</td>`;
    }
    if (hasStaff) {
      html += `<td>${row.Staf}</td>`;
    }
    if (hasFlu) {
      html += `<td>${row.Kasus_Flu}</td>`;
    }

    html += `<td><strong>${row.Okupansi.toFixed(1)}%</strong></td>`;
    html += `<td><span class="category-pill ${pillClass}">${row.Kategori}</span></td>`;

    tr.innerHTML = html;
    tableBody.appendChild(tr);
  });

  updatePaginationControls(state.tableData.length);
}

function updatePaginationControls(totalItems) {
  const totalPages = Math.ceil(totalItems / state.pageSize) || 1;
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');
  const pageNumbers = document.getElementById('pageNumbers');
  const pageInfo = document.getElementById('pageInfo');

  btnPrevPage.disabled = state.currentPage === 1;
  btnNextPage.disabled = state.currentPage === totalPages;

  const start = (state.currentPage - 1) * state.pageSize + 1;
  const end = Math.min(state.currentPage * state.pageSize, totalItems);

  pageInfo.textContent = totalItems > 0 ? `Menampilkan ${start}-${end} dari ${totalItems} baris` : '0 baris';
  pageNumbers.innerHTML = '';

  const maxButtons = 5;
  let startBtn = Math.max(1, state.currentPage - Math.floor(maxButtons / 2));
  let endBtn = Math.min(totalPages, startBtn + maxButtons - 1);

  if (endBtn - startBtn + 1 < maxButtons) {
    startBtn = Math.max(1, endBtn - maxButtons + 1);
  }

  for (let i = startBtn; i <= endBtn; i++) {
    const btn = document.createElement('button');
    btn.className = `page-num ${i === state.currentPage ? 'active' : ''}`;
    btn.textContent = i;
    btn.addEventListener('click', () => {
      state.currentPage = i;
      renderTable();
    });
    pageNumbers.appendChild(btn);
  }
}

// Unduh tabel sebagai CSV
function exportTableToCSV() {
  if (state.filteredData.length === 0) {
    showToast('Tidak ada data untuk diexport!', 'error');
    return;
  }

  const hasStaff = state.rawData.length > 0 && state.rawData[0].Staf !== undefined;
  const hasFlu = state.rawData.length > 0 && state.rawData[0].Kasus_Flu !== undefined;
  const hasBeds = state.rawData.length > 0 && state.rawData[0].Total_Tempat_Tidur !== undefined;

  const headers = ['Tanggal', 'Pasien_Masuk', 'Pasien_Keluar'];
  if (hasBeds) {
    headers.push('Total_Tempat_Tidur', 'Tempat_Tidur_Terisi');
  }
  if (hasStaff) {
    headers.push('Staf');
  }
  if (hasFlu) {
    headers.push('Kasus_Flu');
  }
  headers.push('Okupansi', 'Kategori');

  let csvContent = headers.join(',') + '\r\n';

  state.filteredData.forEach(row => {
    const lineVals = [row.Tanggal, row.Pasien_Masuk, row.Pasien_Keluar];
    if (hasBeds) {
      lineVals.push(row.Total_Tempat_Tidur, row.Tempat_Tidur_Terisi);
    }
    if (hasStaff) {
      lineVals.push(row.Staf);
    }
    if (hasFlu) {
      lineVals.push(row.Kasus_Flu);
    }
    lineVals.push(row.Okupansi, row.Kategori);

    csvContent += lineVals.join(',') + '\r\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `hospital_occupancy_export_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Berhasil mendownload data CSV!', 'success');
}

// ==========================================================================
// GENERATOR WAWASAN PINTAR OTOMATIS
// ==========================================================================
function renderInsightsTab() {
  const container = document.getElementById('insightContainer');
  const dates = state.rawData;
  const n = dates.length;

  const occVals = dates.map(d => d.Okupansi);
  const meanOcc = calcMean(occVals);
  const maxOcc = Math.max(...occVals);
  const maxOccDay = dates.find(d => d.Okupansi === maxOcc);

  // Hitung tren dari paruh pertama ke paruh kedua
  const half = Math.floor(n / 2);
  const meanFirstHalf = calcMean(occVals.slice(0, half));
  const meanSecondHalf = calcMean(occVals.slice(half));
  let trendStr = 'STABIL';
  let trendIcon = '➡️';
  let trendDesc = 'Tingkat okupansi secara keseluruhan relatif konstan.';

  if (meanSecondHalf - meanFirstHalf > 3) {
    trendStr = 'MENINGKAT';
    trendIcon = '📈';
    trendDesc = `Okupansi naik dari rata-rata ${meanFirstHalf.toFixed(1)}% di paruh pertama menjadi ${meanSecondHalf.toFixed(1)}% di paruh kedua.`;
  } else if (meanFirstHalf - meanSecondHalf > 3) {
    trendStr = 'MENURUN';
    trendIcon = '📉';
    trendDesc = `Okupansi turun dari rata-rata ${meanFirstHalf.toFixed(1)}% di paruh pertama menjadi ${meanSecondHalf.toFixed(1)}% di paruh kedua.`;
  }

  const highDaysCount = dates.filter(d => d.Kategori === 'Tinggi').length;
  const highPercent = ((highDaysCount / n) * 100).toFixed(0);

  container.innerHTML = `
    <div class="insight-card">
      <h3 class="insight-title">Analisis Tren &amp; Korelasi Otomatis</h3>
      
      <div class="insight-grid">
        <div class="insight-bullet">
          <div class="insight-bullet-icon"></div>
          <div class="insight-bullet-content">
            <h4>Tren Okupansi: ${trendStr}</h4>
            <p>${trendDesc}</p>
          </div>
        </div>
        
        <div class="insight-bullet">
          <div class="insight-bullet-icon"></div>
          <div class="insight-bullet-content">
            <h4>Beban Kapasitas Rumah Sakit</h4>
            <p>Rata-rata okupansi Anda sebesar <strong>${meanOcc.toFixed(1)}%</strong>. Standar aman internasional untuk occupancy rate optimal adalah 80%–85%.</p>
          </div>
        </div>
        
        <div class="insight-bullet">
          <div class="insight-bullet-icon"></div>
          <div class="insight-bullet-content">
            <h4>Titik Puncak Tekanan</h4>
            <p>Okupansi tertinggi tercapai pada tanggal <strong>${maxOccDay ? maxOccDay.Tanggal : '-'}</strong> sebesar <strong>${maxOcc.toFixed(1)}%</strong>. Sebanyak ${highDaysCount} dari ${n} titik (${highPercent}%) berada dalam status kritis okupansi tinggi (&gt;85%).</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ==========================================================================
// GRAFIK CANVAS YANG DIGAMBAR MANUAL SECARA PROFESIONAL
// ==========================================================================
function renderAllCharts() {
  const data = state.rawData;
  if (data.length === 0) return;

  chartInstances = {};

  // Render grafik utama yang tersisa (Grafik Lingkaran Kategori Okupansi)
  drawPieChart(data);

  // Sembunyikan grafik tambahan jika ada di halaman
  let extraCard = document.getElementById('extraChartCard');
  if (extraCard) {
    extraCard.style.display = 'none';
  }

  setupExportButtons();
}

function getThemeColors() {
  const isDark = state.theme === 'dark';
  return {
    text: isDark ? '#f3f4f6' : '#0f172a',
    muted: isDark ? '#6b7280' : '#94a3b8',
    grid: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    primary: isDark ? '#3b82f6' : '#2563eb',
    primaryGlow: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.1)',
    purple: isDark ? '#8b5cf6' : '#7c3aed',
    teal: isDark ? '#14b8a6' : '#0d9488',
    success: isDark ? '#10b981' : '#16a34a',
    warning: isDark ? '#f59e0b' : '#d97706',
    danger: isDark ? '#ef4444' : '#dc2626',
    tooltipBg: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)'
  };
}

// Atur Kualitas DPI Canvas
function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  return { ctx, width: rect.width, height: rect.height };
}

// Helper untuk memformat label sumbu tanggal/waktu grafik
function formatChartLabel(tanggal) {
  if (tanggal.includes(' ')) {
    const parts = tanggal.split(' ');
    const date = parts[0].slice(5); // MM-DD
    const hour = parts[1].slice(0, 5); // HH:MM
    return `${date} ${hour}`;
  }
  return tanggal.slice(5); // MM-DD
}

// 1. Grafik Garis: Tren Okupansi + Moving Average
function drawLineChart(data) {
  const canvas = document.getElementById('lineChart');
  if (!canvas) return;

  const { ctx, width, height } = setupCanvas(canvas);
  const colors = getThemeColors();

  const ma7 = calcMovingAverage7Day(data);
  const occs = data.map(d => d.Okupansi);

  const padTop = 35;
  const padBottom = 40;
  const padLeft = 45;
  const padRight = 20;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const minY = 0;
  const maxY = 100;

  // Kisi-kisi sumbu Y
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = colors.muted;
  ctx.font = '10px Inter';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const yVal = minY + (maxY - minY) * (i / gridSteps);
    const y = padTop + plotH - (plotH * (i / gridSteps));

    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();

    ctx.fillText(`${yVal}%`, padLeft - 8, y);
  }

  // Label sumbu X
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelStep = Math.ceil(data.length / 6) || 1;

  for (let i = 0; i < data.length; i++) {
    if (i % labelStep === 0 || i === data.length - 1) {
      const x = padLeft + (plotW * (i / (data.length - 1 || 1)));
      const label = formatChartLabel(data[i].Tanggal);
      ctx.fillText(label, x, padTop + plotH + 8);
    }
  }

  const getCoords = (index, value) => {
    const x = padLeft + (plotW * (index / (data.length - 1 || 1)));
    const y = padTop + plotH - (plotH * ((value - minY) / (maxY - minY)));
    return { x, y };
  };

  // Area gradien
  ctx.beginPath();
  let firstPt = getCoords(0, occs[0]);
  ctx.moveTo(firstPt.x, firstPt.y);
  for (let i = 1; i < occs.length; i++) {
    let pt = getCoords(i, occs[i]);
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.lineTo(padLeft + plotW, padTop + plotH);
  ctx.lineTo(padLeft, padTop + plotH);
  ctx.closePath();

  const fillGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
  fillGrad.addColorStop(0, colors.primaryGlow);
  fillGrad.addColorStop(1, 'rgba(37, 99, 235, 0.0)');
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // Goresan garis
  ctx.beginPath();
  ctx.moveTo(firstPt.x, firstPt.y);
  for (let i = 1; i < occs.length; i++) {
    let pt = getCoords(i, occs[i]);
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Garis MA
  ctx.beginPath();
  let firstMa = getCoords(0, ma7[0]);
  ctx.moveTo(firstMa.x, firstMa.y);
  for (let i = 1; i < ma7.length; i++) {
    let pt = getCoords(i, ma7[i]);
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.strokeStyle = colors.purple;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Legenda
  ctx.font = '10px Inter';
  ctx.textAlign = 'left';

  ctx.fillStyle = colors.primary;
  ctx.fillRect(padLeft + 10, padTop - 20, 12, 6);
  ctx.fillStyle = colors.text;
  ctx.fillText('Okupansi (%)', padLeft + 26, padTop - 16);

  ctx.fillStyle = colors.purple;
  ctx.fillRect(padLeft + 120, padTop - 20, 12, 6);
  ctx.fillStyle = colors.text;
  const isHourly = data.length >= 168;
  ctx.fillText(isHourly ? 'MA 7 Hari (168 jam)' : 'MA 7 Hari', padLeft + 136, padTop - 16);

  // Titik-titik pada puncak tinggi
  for (let i = 0; i < occs.length; i++) {
    if (occs[i] > 85) {
      let pt = getCoords(i, occs[i]);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = colors.danger;
      ctx.fill();
    }
  }
}

// 2. Grafik Batang: Pasien Masuk vs Pasien Keluar
function drawBarChart(data) {
  const canvas = document.getElementById('barChart');
  if (!canvas) return;

  const { ctx, width, height } = setupCanvas(canvas);
  const colors = getThemeColors();

  const admissions = data.map(d => d.Pasien_Masuk);
  const discharges = data.map(d => d.Pasien_Keluar);

  const padTop = 35;
  const padBottom = 40;
  const padLeft = 45;
  const padRight = 20;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxVal = Math.max(...admissions, ...discharges, 10);
  const maxY = Math.ceil(maxVal * 1.15);
  const minY = 0;

  // Garis Kisi-kisi & Label Y
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = colors.muted;
  ctx.font = '10px Inter';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const yVal = Math.round(minY + (maxY - minY) * (i / gridSteps));
    const y = padTop + plotH - (plotH * (i / gridSteps));

    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();

    ctx.fillText(yVal.toString(), padLeft - 8, y);
  }

  // Label X
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelStep = Math.ceil(data.length / 5) || 1;

  for (let i = 0; i < data.length; i++) {
    if (i % labelStep === 0 || i === data.length - 1) {
      const x = padLeft + (plotW * (i / (data.length - 1 || 1)));
      const datePart = formatChartLabel(data[i].Tanggal);
      ctx.fillText(datePart, x, padTop + plotH + 8);
    }
  }

  // Batang
  const numGroups = data.length;
  const groupW = plotW / numGroups;
  const barW = Math.max(groupW * 0.3, 1.5);

  for (let i = 0; i < numGroups; i++) {
    const groupCenterX = padLeft + (groupW * i) + (groupW / 2);

    // Pasien Masuk
    const valAd = admissions[i];
    const barHAd = plotH * (valAd / maxY);
    const xAd = groupCenterX - barW - 0.5;
    const yAd = padTop + plotH - barHAd;

    ctx.fillStyle = colors.success;
    ctx.fillRect(xAd, yAd, barW, barHAd);

    // Pasien Keluar
    const valDis = discharges[i];
    const barHDis = plotH * (valDis / maxY);
    const xDis = groupCenterX + 0.5;
    const yDis = padTop + plotH - barHDis;

    ctx.fillStyle = colors.warning;
    ctx.fillRect(xDis, yDis, barW, barHDis);
  }

  // Legenda
  ctx.font = '10px Inter';
  ctx.textAlign = 'left';

  ctx.fillStyle = colors.success;
  ctx.fillRect(padLeft + 10, padTop - 20, 12, 8);
  ctx.fillStyle = colors.text;
  ctx.fillText('Pasien Masuk', padLeft + 26, padTop - 14);

  ctx.fillStyle = colors.warning;
  ctx.fillRect(padLeft + 110, padTop - 20, 12, 8);
  ctx.fillStyle = colors.text;
  ctx.fillText('Pasien Keluar', padLeft + 126, padTop - 14);
}

// 3. Grafik Lingkaran: Distribusi Kategori Okupansi
function drawPieChart(data) {
  const canvas = document.getElementById('pieChart');
  const legendContainer = document.getElementById('pieLegend');
  if (!canvas || !legendContainer) return;

  const { ctx, width, height } = setupCanvas(canvas);
  const colors = getThemeColors();

  const lowCount = data.filter(d => d.Kategori === 'Rendah').length;
  const normalCount = data.filter(d => d.Kategori === 'Normal').length;
  const highCount = data.filter(d => d.Kategori === 'Tinggi').length;
  const total = data.length;

  const segments = [
    { label: 'Rendah (<60%)', count: lowCount, color: colors.success },
    { label: 'Normal (60%-85%)', count: normalCount, color: colors.warning },
    { label: 'Tinggi (>85%)', count: highCount, color: colors.danger }
  ];

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.38;

  let startAngle = -Math.PI / 2;

  segments.forEach(segment => {
    if (segment.count === 0) return;

    const sliceAngle = (segment.count / total) * (2 * Math.PI);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();

    ctx.fillStyle = segment.color;
    ctx.fill();

    ctx.strokeStyle = state.theme === 'dark' ? '#0b0f19' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    const share = segment.count / total;
    if (share > 0.08) {
      const midAngle = startAngle + (sliceAngle / 2);
      const textRadius = radius * 0.65;
      const tx = cx + Math.cos(midAngle) * textRadius;
      const ty = cy + Math.sin(midAngle) * textRadius;

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${(share * 100).toFixed(2)}%`, tx, ty);
    }

    startAngle += sliceAngle;
  });

  // Lubang tengah
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.45, 0, 2 * Math.PI);
  ctx.fillStyle = state.theme === 'dark' ? '#111827' : '#ffffff';
  ctx.fill();

  // Legenda
  legendContainer.innerHTML = segments.map(seg => {
    const pct = total > 0 ? ((seg.count / total) * 100).toFixed(2) : 0;
    return `
      <div class="legend-item">
        <div class="legend-info">
          <span class="legend-color" style="background-color: ${seg.color}"></span>
          <span><strong>${seg.label}</strong></span>
        </div>
        <span class="legend-value">${seg.count} data (${pct}%)</span>
      </div>
    `;
  }).join('');
}

// 4. Histogram: Distribusi frekuensi okupansi
function drawHistogramChart(data) {
  const canvas = document.getElementById('histogramChart');
  if (!canvas) return;

  const { ctx, width, height } = setupCanvas(canvas);
  const colors = getThemeColors();

  const occs = data.map(d => d.Okupansi);

  const bins = [
    { label: '0-20%', count: 0 },
    { label: '20-40%', count: 0 },
    { label: '40-60%', count: 0 },
    { label: '60-80%', count: 0 },
    { label: '80-100%', count: 0 }
  ];

  occs.forEach(val => {
    if (val >= 0 && val <= 20) bins[0].count++;
    else if (val > 20 && val <= 40) bins[1].count++;
    else if (val > 40 && val <= 60) bins[2].count++;
    else if (val > 60 && val <= 80) bins[3].count++;
    else if (val > 80 && val <= 100) bins[4].count++;
  });

  const padTop = 30;
  const padBottom = 40;
  const padLeft = 45;
  const padRight = 20;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const counts = bins.map(b => b.count);
  const maxCount = Math.max(...counts, 2);
  const maxY = Math.ceil(maxCount * 1.1);

  // Kisi-kisi sumbu Y
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = colors.muted;
  ctx.font = '10px Inter';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const yVal = Math.round((maxY / steps) * i);
    const y = padTop + plotH - (plotH * (i / steps));

    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();

    ctx.fillText(yVal.toString(), padLeft - 8, y);
  }

  const numBars = bins.length;
  const barWidth = (plotW / numBars) * 0.85;
  const stepW = plotW / numBars;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let i = 0; i < numBars; i++) {
    const bin = bins[i];
    const x = padLeft + (stepW * i) + (stepW - barWidth) / 2;
    const barH = plotH * (bin.count / maxY);
    const y = padTop + plotH - barH;

    let barColor = colors.primary;
    if (i <= 2) barColor = colors.teal;
    if (i === 3) barColor = colors.warning;
    if (i === 4) barColor = colors.danger;

    ctx.fillStyle = barColor;
    ctx.fillRect(x, y, barWidth, barH);

    if (bin.count > 0) {
      ctx.fillStyle = colors.text;
      ctx.font = 'bold 9px Inter';
      ctx.fillText(bin.count.toString(), x + barWidth / 2, y - 10);
    }

    ctx.fillStyle = colors.muted;
    ctx.font = '9px Inter';
    ctx.fillText(bin.label, x + barWidth / 2, padTop + plotH + 8);
  }

  ctx.save();
  ctx.translate(12, padTop + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = colors.muted;
  ctx.font = '10px Inter';
  ctx.fillText('Frekuensi (Hari/Titik)', 0, 0);
  ctx.restore();
}

// 5. Grafik Tambahan: Tren Jumlah Staf dan Kasus Flu (Dua Sumbu Y)
function drawExtraChart(data) {
  const canvas = document.getElementById('extraChart');
  if (!canvas) return;

  const { ctx, width, height } = setupCanvas(canvas);
  const colors = getThemeColors();

  const staff = data.map(d => d.Staf || 0);
  const flu = data.map(d => d.Kasus_Flu || 0);

  const padTop = 35;
  const padBottom = 40;
  const padLeft = 45;
  const padRight = 45;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxStaff = Math.max(...staff, 10);
  const maxFlu = Math.max(...flu, 5);

  const maxYStaff = Math.ceil(maxStaff * 1.15);
  const maxYFlu = Math.ceil(maxFlu * 1.15);

  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = colors.muted;
  ctx.font = '10px Inter';

  // Kisi Sumbu Kiri (Staf)
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const yValStaff = Math.round((maxYStaff / gridSteps) * i);
    const y = padTop + plotH - (plotH * (i / gridSteps));

    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();

    ctx.fillText(yValStaff.toString(), padLeft - 8, y);
  }

  // Sumbu Rujukan Kanan (Kasus Flu)
  ctx.textAlign = 'left';
  for (let i = 0; i <= gridSteps; i++) {
    const yValFlu = Math.round((maxYFlu / gridSteps) * i);
    const y = padTop + plotH - (plotH * (i / gridSteps));
    ctx.fillText(yValFlu.toString(), padLeft + plotW + 8, y);
  }

  // Label X
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelStep = Math.ceil(data.length / 5) || 1;

  for (let i = 0; i < data.length; i++) {
    if (i % labelStep === 0 || i === data.length - 1) {
      const x = padLeft + (plotW * (i / (data.length - 1 || 1)));
      const datePart = formatChartLabel(data[i].Tanggal);
      ctx.fillText(datePart, x, padTop + plotH + 8);
    }
  }

  const getCoordsStaff = (index, val) => {
    const x = padLeft + (plotW * (index / (data.length - 1 || 1)));
    const y = padTop + plotH - (plotH * (val / maxYStaff));
    return { x, y };
  };

  const getCoordsFlu = (index, val) => {
    const x = padLeft + (plotW * (index / (data.length - 1 || 1)));
    const y = padTop + plotH - (plotH * (val / maxYFlu));
    return { x, y };
  };

  // Gambar Garis Staf
  ctx.beginPath();
  let firstStaff = getCoordsStaff(0, staff[0]);
  ctx.moveTo(firstStaff.x, firstStaff.y);
  for (let i = 1; i < staff.length; i++) {
    let pt = getCoordsStaff(i, staff[i]);
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.strokeStyle = colors.teal;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Gambar batang Flu
  const numGroups = data.length;
  const groupW = plotW / numGroups;
  const barW = Math.max(groupW * 0.4, 2);

  for (let i = 0; i < numGroups; i++) {
    const pt = getCoordsFlu(i, flu[i]);
    const x = pt.x - barW / 2;
    const y = pt.y;
    const barH = padTop + plotH - y;

    const fillGrad = ctx.createLinearGradient(0, y, 0, padTop + plotH);
    fillGrad.addColorStop(0, 'rgba(139, 92, 246, 0.6)');
    fillGrad.addColorStop(1, 'rgba(139, 92, 246, 0.1)');

    ctx.fillStyle = fillGrad;
    ctx.fillRect(x, y, barW, barH);

    ctx.strokeStyle = colors.purple;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, barW, barH);
  }

  // Legenda
  ctx.font = '10px Inter';
  ctx.textAlign = 'left';

  ctx.fillStyle = colors.teal;
  ctx.fillRect(padLeft + 10, padTop - 20, 12, 6);
  ctx.fillStyle = colors.text;
  ctx.fillText('Staf Medis (Kiri)', padLeft + 26, padTop - 16);

  ctx.fillStyle = colors.purple;
  ctx.fillRect(padLeft + 130, padTop - 20, 12, 6);
  ctx.fillStyle = colors.text;
  ctx.fillText('Kasus Flu (Kanan)', padLeft + 146, padTop - 16);
}

// Unduh grafik canvas sebagai PNG
function setupExportButtons() {
  const wireBtn = (btnId, canvasId, filename) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', () => {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast(`Grafik berhasil diexport ke PNG!`, 'success');
    });
  };

  wireBtn('exportLineChart', 'lineChart', 'tren_okupansi_harian');
  wireBtn('exportBarChart', 'barChart', 'pasien_masuk_keluar');
  wireBtn('exportPieChart', 'pieChart', 'kategori_okupansi_pie');
  wireBtn('exportHistogram', 'histogramChart', 'histogram_distribusi_okupansi');
  wireBtn('exportExtraChart', 'extraChart', 'tren_staf_dan_flu');
}

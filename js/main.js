let geojsonData = null;
let statsData = [];
let map, geojsonLayer, myChart;

// ==========================================
// FUNCIONES PARA CONTROLAR EL PANTALLAZO DE CARGA
// ==========================================

function hideLoader() {
    const loader = document.getElementById('loading-overlay');
    if (loader) {
        loader.classList.add('loader-hidden');
    }
}

function showErrorInLoader(message) {
    const loader = document.getElementById('loading-overlay');
    if (loader) {
        loader.innerHTML = `
            <div style="text-align: center; max-width: 400px; padding: 20px;">
                <i class="fa-solid fa-circle-exclamation" style="font-size: 3rem; color: #ef4444; margin-bottom: 1rem;"></i>
                <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem;">Error de Carga</h2>
                <p style="font-size: 0.875rem; color: #cbd5e1;">${message}</p>
            </div>
        `;
    }
}

// ==========================================
// CARGA DE DATOS E INICIALIZACIÓN
// ==========================================

async function loadData() {
    try {
        let geoResponse = await fetch('./data/departamentos.geojson');
        if (!geoResponse.ok) geoResponse = await fetch('data/departamentos.geojson');

        let statsResponse = await fetch('./data/desmonte_stats.json');
        if (!statsResponse.ok) statsResponse = await fetch('data/desmonte_stats.json');

        if (!geoResponse.ok || !statsResponse.ok) {
            throw new Error("No se pudieron cargar los archivos de datos (JSON/GeoJSON).");
        }

        geojsonData = await geoResponse.json();
        statsData = await statsResponse.json();

        // Inicializar mapas, gráficos y tablas
        initApp();

        // ---> AQUÍ SE OCULTA EL CARGADOR CUANDO TODO YA ESTÁ LISTO <---
        hideLoader();

    } catch (error) {
        console.error("Error al cargar datos:", error);
        
        // ---> SI HAY UN ERROR, SE MUESTRA EN EL CARTEL FLOTANTE <---
        showErrorInLoader(error.message);
    }
}

function initApp() {
    initDropdowns();
    initMap();
    initChart();
    
    document.getElementById('prov-select').addEventListener('change', onProvChange);
    document.getElementById('dpto-select').addEventListener('change', updateDashboard);
    document.getElementById('period-select').addEventListener('change', updateDashboard);
    
    const btnReset = document.getElementById('btn-reset');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            document.getElementById('prov-select').value = 'ALL';
            populateDepartments();
            document.getElementById('dpto-select').value = 'ALL';
            document.getElementById('period-select').value = 'ALL';
            updateDashboard();
        });
    }

    const btnExport = document.getElementById('btn-export-csv');
    if (btnExport) {
        btnExport.addEventListener('click', downloadCSV);
    }

    updateDashboard();
}

function initDropdowns() {
    const provSelect = document.getElementById('prov-select');
    provSelect.innerHTML = '<option value="ALL">Todas las Provincias</option>';
    const provs = [...new Set(statsData.map(d => d.prov))].sort();
    provs.forEach(p => provSelect.add(new Option(p, p)));

    const periodSelect = document.getElementById('period-select');
    periodSelect.innerHTML = '<option value="ALL">Todos los Períodos</option>';
    const periods = [...new Set(statsData.map(d => d.period))].sort();
    periods.forEach(p => periodSelect.add(new Option(p, p)));

    populateDepartments();
}

function populateDepartments() {
    const selectedProv = document.getElementById('prov-select').value;
    const dptoSelect = document.getElementById('dpto-select');
    dptoSelect.innerHTML = '<option value="ALL">Todos los Departamentos</option>';

    const dptoSet = new Set();
    statsData.forEach(d => {
        if (selectedProv === 'ALL' || d.prov.toLowerCase() === selectedProv.toLowerCase()) {
            if (d.dpto) dptoSet.add(d.dpto.trim());
        }
    });

    Array.from(dptoSet).sort().forEach(d => dptoSelect.add(new Option(d, d)));
}

function onProvChange() {
    populateDepartments();
    updateDashboard();
}

function formatNumber(num) {
    return num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Mapa con capa gratuita OpenStreetMap libre de API KEY
function initMap() {
    map = L.map('map').setView([-24.5, -62.0], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    }).addTo(map);

    if (geojsonData) {
        geojsonLayer = L.geoJSON(geojsonData, {
            style: () => ({ fillColor: '#ef4444', weight: 1, opacity: 1, color: '#b91c1c', fillOpacity: 0.2 }),
            onEachFeature: (feature, layer) => {
                const p = feature.properties;
                const dptoName = (p.nam || p.departament || p.dpto || p.depto || 'Departamento').trim();
                const provName = (p.Prov || p.fna || p.provincia || '').trim();

                layer.bindPopup(`<strong>${dptoName}</strong><br/>Provincia: ${provName || 'N/D'}`);
                
                layer.on('click', () => {
                    if (provName) {
                        const provSelect = document.getElementById('prov-select');
                        const matchingProv = Array.from(provSelect.options).find(opt => opt.value.toLowerCase() === provName.toLowerCase());
                        if (matchingProv) {
                            provSelect.value = matchingProv.value;
                            populateDepartments();
                        }
                    }

                    const dptoSelect = document.getElementById('dpto-select');
                    dptoSelect.value = dptoName;
                    updateDashboard();
                });
            }
        }).addTo(map);
    }
}

function initChart() {
    const ctx = document.getElementById('myChart').getContext('2d');
    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Hectáreas Desmontadas',
                data: [],
                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                borderColor: 'rgba(185, 28, 28, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function updateDashboard() {
    const prov = document.getElementById('prov-select').value;
    const dpto = document.getElementById('dpto-select').value;
    const period = document.getElementById('period-select').value;

    const filtered = statsData.filter(d => {
        const matchProv = (prov === 'ALL' || d.prov.toLowerCase() === prov.toLowerCase());
        const matchDpto = (dpto === 'ALL' || d.dpto.toLowerCase() === dpto.toLowerCase());
        const matchPeriod = (period === 'ALL' || d.period === period);
        return matchProv && matchDpto && matchPeriod;
    });

    const totalArea = filtered.reduce((acc, curr) => acc + curr.area, 0);
    const uniqueProvs = new Set(filtered.map(d => d.prov)).size;
    const uniqueDptos = new Set(filtered.map(d => d.dpto)).size;

    let peakPeriod = '-';
    if (filtered.length > 0) {
        const periodTotals = {};
        filtered.forEach(d => { periodTotals[d.period] = (periodTotals[d.period] || 0) + d.area; });
        peakPeriod = Object.keys(periodTotals).reduce((a, b) => periodTotals[a] > periodTotals[b] ? a : b);
    }

    document.getElementById('kpi-total').textContent = formatNumber(totalArea) + " ha";
    document.getElementById('kpi-provs').textContent = uniqueProvs;
    document.getElementById('kpi-dptos').textContent = uniqueDptos;
    document.getElementById('kpi-pico').textContent = peakPeriod;

    updateTable(filtered);
    updateChart(filtered, prov, dpto);
    updateMapHighlight(prov, dpto);
}

function updateTable(rows) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 15px; color: #64748b;">No hay registros para este filtro</td></tr>';
        return;
    }

    // Copiar y ordenar el array para que "Hasta 1976" quede primero
    const sortedRows = [...rows].sort((a, b) => {
        const periodA = String(a.period || '');
        const periodB = String(b.period || '');

        if (periodA.toLowerCase().includes('hasta 1976')) return -1;
        if (periodB.toLowerCase().includes('hasta 1976')) return 1;

        return periodA.localeCompare(periodB, undefined, { numeric: true, sensitivity: 'base' });
    });

    sortedRows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${r.prov}</strong></td>
            <td>${r.dpto}</td>
            <td><span style="background: #f1f5f9; padding: 2px 8px; border-radius: 4px;">${r.period}</span></td>
            <td style="text-align: right; font-weight: 600; color: #ef4444;">${formatNumber(r.area)}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Función del gráfico con ordenamiento donde "Hasta 1976" va PRIMERO
function updateChart(rows, selectedProv, selectedDpto) {
    let grouped = {};
    if (selectedDpto !== 'ALL') {
        rows.forEach(r => { grouped[r.period] = (grouped[r.period] || 0) + r.area; });
    } else if (selectedProv === 'ALL') {
        rows.forEach(r => { grouped[r.prov] = (grouped[r.prov] || 0) + r.area; });
    } else {
        rows.forEach(r => { grouped[r.dpto] = (grouped[r.dpto] || 0) + r.area; });
    }

    // Ordenar claves dejando "Hasta 1976" al inicio
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
        if (a.toLowerCase().includes('hasta 1976')) return -1;
        if (b.toLowerCase().includes('hasta 1976')) return 1;
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    myChart.data.labels = sortedKeys;
    myChart.data.datasets[0].data = sortedKeys.map(k => grouped[k]);
    myChart.update();
}

// Resaltado de polígonos validando Provincia Y Departamento simultáneamente
function updateMapHighlight(prov, dpto) {
    if (!geojsonLayer) return;

    let bounds = L.latLngBounds();
    let hasBounds = false;

    geojsonLayer.eachLayer(layer => {
        const props = layer.feature.properties;
        const layerProv = (props.fna || props.provincia || props.Prov || '').trim();
        const layerDpto = (props.nam || props.departament || props.dpto || props.depto || '').trim();

        const matchProv = (prov === 'ALL' || layerProv.toLowerCase().includes(prov.toLowerCase()) || prov.toLowerCase().includes(layerProv.toLowerCase()));
        const matchDpto = (dpto === 'ALL' || layerDpto.toLowerCase() === dpto.toLowerCase());

        // Se exige coincidencia estricta de departamento Y provincia para evitar departamentos homónimos
        if (matchProv && matchDpto) {
            layer.setStyle({ fillOpacity: 0.6, weight: 2, color: '#b91c1c', fillColor: '#ef4444' });
            if (layer.getBounds) {
                bounds.extend(layer.getBounds());
                hasBounds = true;
            }
        } else {
            layer.setStyle({ fillOpacity: 0.05, weight: 1, color: '#94a3b8', fillColor: '#94a3b8' });
        }
    });

    if (hasBounds && (prov !== 'ALL' || dpto !== 'ALL')) {
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 10 });
    } else if (prov === 'ALL' && dpto === 'ALL') {
        map.setView([-24.5, -62.0], 6);
    }
}

// Función de Descarga en CSV
function downloadCSV() {
    const prov = document.getElementById('prov-select').value;
    const dpto = document.getElementById('dpto-select').value;
    const period = document.getElementById('period-select').value;

    const filtered = statsData.filter(d => {
        const matchProv = (prov === 'ALL' || d.prov.toLowerCase() === prov.toLowerCase());
        const matchDpto = (dpto === 'ALL' || d.dpto.toLowerCase() === dpto.toLowerCase());
        const matchPeriod = (period === 'ALL' || d.period === period);
        return matchProv && matchDpto && matchPeriod;
    });

    if (filtered.length === 0) {
        alert("No hay registros para exportar con los filtros seleccionados.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Provincia,Departamento,Periodo,Area (ha)\n";
    filtered.forEach(r => {
        csvContent += `"${r.prov}","${r.dpto}","${r.period}",${r.area}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `desmonte_filtrado_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadData);
} else {
    loadData();
}

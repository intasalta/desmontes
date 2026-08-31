// Variables globales
let geojsonData = null;
let statsData = [];
let map, geojsonLayer, myChart;

// 1. Cargar datos con fallback
async function loadData() {
    try {
        let geoResponse = await fetch('./data/departamentos.geojson');
        if (!geoResponse.ok) geoResponse = await fetch('data/departamentos.geojson');

        let statsResponse = await fetch('./data/desmonte_stats.json');
        if (!statsResponse.ok) statsResponse = await fetch('data/desmonte_stats.json');

        if (!geoResponse.ok || !statsResponse.ok) {
            throw new Error("No se pudieron cargar los archivos de datos desde la carpeta 'data'.");
        }

        geojsonData = await geoResponse.json();
        statsData = await statsResponse.json();

        initApp();
    } catch (error) {
        console.error("Error al cargar datos:", error);
        const tbody = document.getElementById('table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#ef4444; padding: 20px;">
                <strong>Error de carga:</strong> ${error.message}
            </td></tr>`;
        }
    }
}

// 2. Inicialización de App
function initApp() {
    initDropdowns();
    initMap();
    initChart();
    updateDashboard();

    document.getElementById('prov-select').addEventListener('change', onProvChange);
    document.getElementById('dpto-select').addEventListener('change', updateDashboard);
    document.getElementById('period-select').addEventListener('change', updateDashboard);
}

// Ordenamiento especial asegurando que "Hasta 1976" aparezca primero
function getSortedPeriods(data) {
    const rawPeriods = [...new Set(data.map(d => d.period))].filter(Boolean);
    
    // Separar 'Hasta 1976' para forzar que sea el primero
    const firstPeriod = rawPeriods.filter(p => p.toLowerCase().includes('1976'));
    const otherPeriods = rawPeriods.filter(p => !p.toLowerCase().includes('1976')).sort();

    return [...firstPeriod, ...otherPeriods];
}

// Inicializar desplegables
function initDropdowns() {
    const provSelect = document.getElementById('prov-select');
    provSelect.innerHTML = '<option value="ALL">Todas las provincias</option>';
    
    const provs = [...new Set(statsData.map(d => d.prov))].sort();
    provs.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        provSelect.appendChild(opt);
    });

    const periodSelect = document.getElementById('period-select');
    periodSelect.innerHTML = '<option value="ALL">Todos los periodos</option>';

    const sortedPeriods = getSortedPeriods(statsData);
    sortedPeriods.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        periodSelect.appendChild(opt);
    });

    populateDepartments();
}

function populateDepartments() {
    const selectedProv = document.getElementById('prov-select').value;
    const dptoSelect = document.getElementById('dpto-select');
    dptoSelect.innerHTML = '<option value="ALL">Todos los departamentos</option>';

    const dptoSet = new Set();

    statsData.forEach(d => {
        if (selectedProv === 'ALL' || d.prov.toLowerCase() === selectedProv.toLowerCase()) {
            if (d.dpto) dptoSet.add(d.dpto.trim());
        }
    });

    if (geojsonData && geojsonData.features) {
        geojsonData.features.forEach(f => {
            const props = f.properties;
            const layerProv = (props.fna || props.provincia || props.Prov || '').trim();
            const layerDpto = (props.nam || props.departament || props.dpto || props.depto || '').trim();

            if (selectedProv === 'ALL' || layerProv.toLowerCase() === selectedProv.toLowerCase()) {
                if (layerDpto) dptoSet.add(layerDpto);
            }
        });
    }

    const sortedDptos = Array.from(dptoSet).sort();
    sortedDptos.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        dptoSelect.appendChild(opt);
    });
}

function onProvChange() {
    populateDepartments();
    updateDashboard();
}

function formatNumber(num) {
    return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 3. Mapa Leaflet (Capa CartoDB Positron Estable)
function initMap() {
    map = L.map('map').setView([-24.5, -62.0], 6);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    if (geojsonData) {
        geojsonLayer = L.geoJSON(geojsonData, {
            style: styleFeature,
            onEachFeature: onEachFeature
        }).addTo(map);
    }
}

function styleFeature(feature) {
    return {
        fillColor: '#ef4444',
        weight: 1,
        opacity: 1,
        color: '#b91c1c',
        fillOpacity: 0.2
    };
}

function onEachFeature(feature, layer) {
    const p = feature.properties;
    const dptoName = (p.nam || p.departament || p.dpto || p.depto || 'Departamento').trim();
    
    layer.bindPopup(`
        <strong>${dptoName}</strong><br/>
        Provincia: ${p.Prov || p.fna || p.provincia || 'N/D'}
    `);

    layer.on('click', () => {
        const dptoSelect = document.getElementById('dpto-select');
        if (dptoSelect) {
            const options = Array.from(dptoSelect.options);
            const matchingOption = options.find(opt => opt.value.toLowerCase() === dptoName.toLowerCase());
            
            dptoSelect.value = matchingOption ? matchingOption.value : dptoName;
            updateDashboard();
        }
    });
}

// 4. Gráfico Chart.js
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
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// 5. Actualizar Dashboard
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

    // Actualizar KPIs
    const totalArea = filtered.reduce((acc, curr) => acc + curr.area, 0);
    document.getElementById('kpi-total').textContent = formatNumber(totalArea) + " ha";

    const uniqueProvs = new Set(filtered.map(d => d.prov)).size;
    const uniqueDptos = new Set(filtered.map(d => d.dpto)).size;
    document.getElementById('kpi-prov-count').textContent = uniqueProvs;
    document.getElementById('kpi-dpto-count').textContent = uniqueDptos;

    // Calcular período con mayor desmonte
    let periodTotals = {};
    filtered.forEach(d => {
        periodTotals[d.period] = (periodTotals[d.period] || 0) + d.area;
    });
    let maxPeriod = '-';
    let maxVal = 0;
    Object.entries(periodTotals).forEach(([p, val]) => {
        if (val > maxVal) { maxVal = val; maxPeriod = p; }
    });
    document.getElementById('kpi-max-period').textContent = maxPeriod !== '-' ? `${maxPeriod} (${formatNumber(maxVal)} ha)` : '-';

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

    rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${r.prov}</strong></td>
            <td>${r.dpto}</td>
            <td><span style="background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-weight: 500;">${r.period}</span></td>
            <td style="text-align: right; font-weight: 600; color: #ef4444;">${formatNumber(r.area)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateChart(rows, selectedProv, selectedDpto) {
    let grouped = {};

    if (selectedDpto !== 'ALL') {
        rows.forEach(r => { grouped[r.period] = (grouped[r.period] || 0) + r.area; });
    } else if (selectedProv === 'ALL') {
        rows.forEach(r => { grouped[r.prov] = (grouped[r.prov] || 0) + r.area; });
    } else {
        rows.forEach(r => { grouped[r.dpto] = (grouped[r.dpto] || 0) + r.area; });
    }

    // Si las claves del gráfico son períodos, asegurar que 'Hasta 1976' quede al inicio
    let keys = Object.keys(grouped);
    if (selectedDpto !== 'ALL') {
        const first = keys.filter(k => k.toLowerCase().includes('1976'));
        const rest = keys.filter(k => !k.toLowerCase().includes('1976')).sort();
        keys = [...first, ...rest];
    } else {
        keys.sort();
    }

    myChart.data.labels = keys;
    myChart.data.datasets[0].data = keys.map(k => grouped[k]);
    myChart.update();
}

function updateMapHighlight(prov, dpto) {
    if (!geojsonLayer) return;

    let bounds = L.latLngBounds();
    let hasBounds = false;

    geojsonLayer.eachLayer(layer => {
        const props = layer.feature.properties;
        const layerProv = (props.fna || props.provincia || props.Prov || '').trim();
        const layerDpto = (props.nam || props.departament || props.dpto || props.depto || '').trim();

        const matchProv = (prov === 'ALL' || layerProv.toLowerCase() === prov.toLowerCase());
        const matchDpto = (dpto === 'ALL' || layerDpto.toLowerCase() === dpto.toLowerCase());

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

// 6. Restablecer Filtros
function resetFilters() {
    document.getElementById('prov-select').value = 'ALL';
    populateDepartments();
    document.getElementById('dpto-select').value = 'ALL';
    document.getElementById('period-select').value = 'ALL';
    updateDashboard();
}

// 7. Descarga en CSV de la Tabla
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
        alert("No hay datos para exportar.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Provincia,Departamento,Periodo,Superficie (ha)\n";
    filtered.forEach(row => {
        csvContent += `"${row.prov}","${row.dpto}","${row.period}",${row.area}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "reporte_desmonte.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Inicio asegurado de carga
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadData);
} else {
    loadData();
}

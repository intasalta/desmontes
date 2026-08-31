let geojsonData = null;
let statsData = [];
let map, geojsonLayer, myChart;

async function loadData() {
    try {
        let geoResponse = await fetch('./data/departamentos.geojson');
        if (!geoResponse.ok) geoResponse = await fetch('data/departamentos.geojson');

        let statsResponse = await fetch('./data/desmonte_stats.json');
        if (!statsResponse.ok) statsResponse = await fetch('data/desmonte_stats.json');

        if (!geoResponse.ok || !statsResponse.ok) {
            throw new Error("No se pudieron cargar las fuentes JSON/GeoJSON.");
        }

        geojsonData = await geoResponse.json();
        statsData = await statsResponse.json();

        initApp();
    } catch (error) {
        console.error("Error al cargar datos:", error);
        const tbody = document.getElementById('table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#ef4444; padding: 20px;">
                <strong>Error al cargar los datos:</strong> ${error.message}
            </td></tr>`;
        }
    }
}

function initApp() {
    initDropdowns();
    initMap();
    initChart();
    
    // Event listeners de filtros
    document.getElementById('prov-select').addEventListener('change', onProvChange);
    document.getElementById('dpto-select').addEventListener('change', updateDashboard);
    document.getElementById('period-select').addEventListener('change', updateDashboard);
    
    // Event listener para el botón Restablecer Filtros
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
        if (selectedProv === 'ALL' || d.prov === selectedProv) {
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

function initMap() {
    map = L.map('map').setView([-24.5, -62.0], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19
    }).addTo(map);

    if (geojsonData) {
        geojsonLayer = L.geoJSON(geojsonData, {
            style: () => ({ fillColor: '#ef4444', weight: 1, opacity: 1, color: '#b91c1c', fillOpacity: 0.2 }),
            onEachFeature: (feature, layer) => {
                const p = feature.properties;
                const dptoName = (p.nam || p.departament || p.dpto || p.depto || 'Departamento').trim();
                layer.bindPopup(`<strong>${dptoName}</strong><br/>Provincia: ${p.Prov || p.fna || p.provincia || 'N/D'}`);
                layer.on('click', () => {
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

    // Actualizar KPIs
    const totalArea = filtered.reduce((acc, curr) => acc + curr.area, 0);
    const uniqueProvs = new Set(filtered.map(d => d.prov)).size;
    const uniqueDptos = new Set(filtered.map(d => d.dpto)).size;

    // Calcular período con mayor desmonte (Pico)
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

    rows.forEach(r => {
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

function updateChart(rows, selectedProv, selectedDpto) {
    let grouped = {};
    if (selectedDpto !== 'ALL') {
        rows.forEach(r => { grouped[r.period] = (grouped[r.period] || 0) + r.area; });
    } else if (selectedProv === 'ALL') {
        rows.forEach(r => { grouped[r.prov] = (grouped[r.prov] || 0) + r.area; });
    } else {
        rows.forEach(r => { grouped[r.dpto] = (grouped[r.dpto] || 0) + r.area; });
    }

    myChart.data.labels = Object.keys(grouped).sort();
    myChart.data.datasets[0].data = Object.keys(grouped).sort().map(k => grouped[k]);
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadData);
} else {
    loadData();
}

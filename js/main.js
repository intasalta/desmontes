// Variables globales
let geojsonData = null;
let statsData = [];
let map, geojsonLayer, myChart;

// 1. Cargar datos desde los archivos externos
async function loadData() {
    try {
        const [geoResponse, statsResponse] = await Promise.all([
            fetch('data/departamentos.geojson'),
            fetch('data/desmonte_stats.json')
        ]);

        if (!geoResponse.ok || !statsResponse.ok) {
            throw new Error('No se pudieron obtener uno o ambos archivos de datos.');
        }

        geojsonData = await geoResponse.json();
        statsData = await statsResponse.json();

        // Inicializar la aplicación tras cargar los datos
        initApp();
    } catch (error) {
        console.error("Error al cargar los archivos de datos:", error);
        const tbody = document.getElementById('table-body');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error al cargar datos. Asegúrate de ejecutar la web en un servidor local (HTTP/HTTPS).</td></tr>';
        }
    }
}

// 2. Inicialización General
function initApp() {
    initDropdowns();
    initMap();
    initChart();
    updateDashboard();

    // Event listeners para los filtros
    document.getElementById('prov-select').addEventListener('change', onProvChange);
    document.getElementById('dpto-select').addEventListener('change', updateDashboard);
    document.getElementById('period-select').addEventListener('change', updateDashboard);
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

    const periods = [...new Set(statsData.map(d => d.period))].sort();
    periods.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        periodSelect.appendChild(opt);
    });
}

function onProvChange() {
    const selectedProv = document.getElementById('prov-select').value;
    const dptoSelect = document.getElementById('dpto-select');
    dptoSelect.innerHTML = '<option value="ALL">Todos los departamentos</option>';

    if (selectedProv !== 'ALL') {
        const dptos = [...new Set(statsData.filter(d => d.prov === selectedProv).map(d => d.dpto))].sort();
        dptos.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            dptoSelect.appendChild(opt);
        });
    }
    updateDashboard();
}

// Formateador de números
function formatNumber(num) {
    return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 3. Inicializar Mapa Leaflet
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
    layer.bindPopup(`
        <strong>${p.nam || 'Departamento'}</strong><br/>
        Provincia: ${p.fna || 'N/D'}
    `);
}

// 4. Inicializar Gráfico Chart.js
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
                borderWidth: 1
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

// 5. Actualizar la aplicación (Dashboard)
function updateDashboard() {
    const prov = document.getElementById('prov-select').value;
    const dpto = document.getElementById('dpto-select').value;
    const period = document.getElementById('period-select').value;

    const filtered = statsData.filter(d => {
        const matchProv = (prov === 'ALL' || d.prov === prov);
        const matchDpto = (dpto === 'ALL' || d.dpto === dpto);
        const matchPeriod = (period === 'ALL' || d.period === period);
        return matchProv && matchDpto && matchPeriod;
    });

    // Calcular y actualizar total en tarjeta
    const totalArea = filtered.reduce((acc, curr) => acc + curr.area, 0);
    document.getElementById('kpi-total').textContent = formatNumber(totalArea) + " ha";

    // Actualizar Tabla y Gráficos
    updateTable(filtered);
    updateChart(filtered, prov);
    updateMapHighlight(prov, dpto);
}

// 6. Actualización de Tabla
function updateTable(rows) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay registros para este filtro</td></tr>';
        return;
    }

    // Muestra TODAS las filas filtradas
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

// Actualización de Gráfico
function updateChart(rows, selectedProv) {
    let grouped = {};

    if (selectedProv === 'ALL') {
        rows.forEach(r => {
            grouped[r.prov] = (grouped[r.prov] || 0) + r.area;
        });
    } else {
        rows.forEach(r => {
            grouped[r.dpto] = (grouped[r.dpto] || 0) + r.area;
        });
    }

    const labels = Object.keys(grouped);
    const data = Object.values(grouped);

    myChart.data.labels = labels;
    myChart.data.datasets[0].data = data;
    myChart.update();
}

// Destacar en Mapa
function updateMapHighlight(prov, dpto) {
    if (!geojsonLayer) return;

    let bounds = L.latLngBounds();
    let hasBounds = false;

    geojsonLayer.eachLayer(layer => {
        const props = layer.feature.properties;
        const layerProv = props.fna || props.provincia || '';
        const layerDpto = props.nam || props.departament || '';

        const matchProv = (prov === 'ALL' || layerProv.toUpperCase().includes(prov.toUpperCase()));
        const matchDpto = (dpto === 'ALL' || layerDpto.toUpperCase().includes(dpto.toUpperCase()));

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

// Ejecutar al cargar la página
window.onload = loadData;

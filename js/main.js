// Variables globales
let geojsonData = null;
let statsData = [];
let map, geojsonLayer, myChart;

// 1. Cargar datos con fallback de rutas para GitHub Pages
async function loadData() {
    try {
        let geoResponse, statsResponse;

        // Probar primero la ruta relativa local y si falla probar ruta relativa simple
        geoResponse = await fetch('./data/departamentos.geojson');
        if (!geoResponse.ok) {
            geoResponse = await fetch('data/departamentos.geojson');
        }

        statsResponse = await fetch('./data/desmonte_stats.json');
        if (!statsResponse.ok) {
            statsResponse = await fetch('data/desmonte_stats.json');
        }

        if (!geoResponse.ok) {
            throw new Error(`No se pudo cargar 'departamentos.geojson' (Status HTTP ${geoResponse.status})`);
        }
        if (!statsResponse.ok) {
            throw new Error(`No se pudo cargar 'desmonte_stats.json' (Status HTTP ${statsResponse.status})`);
        }

        geojsonData = await geoResponse.json();
        statsData = await statsResponse.json();

        // Inicializar la aplicación cuando los datos estén listos
        initApp();

    } catch (error) {
        console.error("Error al cargar datos:", error);
        const tbody = document.getElementById('table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#ef4444; padding: 20px;">
                <strong>Error de carga:</strong> ${error.message}<br/>
                <small>Verifica que la carpeta 'data' contenga los archivos 'departamentos.geojson' y 'desmonte_stats.json'.</small>
            </td></tr>`;
        }
    }
}

// 2. Inicialización General
function initApp() {
    initDropdowns();
    initMap();
    initChart();
    updateDashboard();

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

    // Carga inicial del menú de departamentos
    populateDepartments();
}

// Función encargada de llenar los departamentos unificando GeoJSON y Datos
function populateDepartments() {
    const selectedProv = document.getElementById('prov-select').value;
    const dptoSelect = document.getElementById('dpto-select');
    dptoSelect.innerHTML = '<option value="ALL">Todos los departamentos</option>';

    const dptoSet = new Set();

    // 1. Obtener departamentos desde la tabla de estadísticas
    statsData.forEach(d => {
        if (selectedProv === 'ALL' || d.prov === selectedProv) {
            if (d.dpto) dptoSet.add(d.dpto.trim());
        }
    });

    // 2. Obtener departamentos desde el GeoJSON (Asegura departamentos como Santa Victoria)
    if (geojsonData && geojsonData.features) {
        geojsonData.features.forEach(f => {
            const props = f.properties;
            const layerProv = props.fna || props.provincia || props.Prov || '';
            const layerDpto = props.nam || props.departament || props.dpto || props.depto || '';

            if (selectedProv === 'ALL' || layerProv.toUpperCase().includes(selectedProv.toUpperCase())) {
                if (layerDpto) dptoSet.add(layerDpto.trim());
            }
        });
    }

    // 3. Poblar el menú desplegable ordenado alfabéticamente
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

// 3. Inicializar Mapa Leaflet con tiles funcionales
function initMap() {
    map = L.map('map').setView([-24.5, -62.0], 6);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
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
    const dptoName = p.nam || p.departament || p.dpto || p.depto || 'Departamento';
    
    layer.bindPopup(`
        <strong>${dptoName}</strong><br/>
        Provincia: ${p.Prov || p.fna || p.provincia || 'N/D'}
    `);

    // Evento al hacer clic en el polígono en el mapa
    layer.on('click', () => {
        const dptoSelect = document.getElementById('dpto-select');
        if (dptoSelect) {
            dptoSelect.value = dptoName;
            updateDashboard();
        }
    });
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
        const matchProv = (prov === 'ALL' || d.prov === prov);
        const matchDpto = (dpto === 'ALL' || d.dpto === dpto);
        const matchPeriod = (period === 'ALL' || d.period === period);
        return matchProv && matchDpto && matchPeriod;
    });

    const totalArea = filtered.reduce((acc, curr) => acc + curr.area, 0);
    document.getElementById('kpi-total').textContent = formatNumber(totalArea) + " ha";

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

    // Si hay un departamento específico seleccionado, mostrar la evolución histórica (agrupado por período)
    if (selectedDpto !== 'ALL') {
        rows.forEach(r => {
            grouped[r.period] = (grouped[r.period] || 0) + r.area;
        });
    } else if (selectedProv === 'ALL') {
        rows.forEach(r => {
            grouped[r.prov] = (grouped[r.prov] || 0) + r.area;
        });
    } else {
        rows.forEach(r => {
            grouped[r.dpto] = (grouped[r.dpto] || 0) + r.area;
        });
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
        
        const layerProv = props.fna || props.provincia || props.Prov || '';
        const layerDpto = props.nam || props.departament || props.dpto || props.depto || '';

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

// Ejecución directa asegurada sin depender únicamente de window.onload
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadData);
} else {
    loadData();
}

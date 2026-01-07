export class UiManager {
    constructor() {
        this.sections = document.querySelectorAll('section');
        this.navBtns = document.querySelectorAll('.nav-btn, .menu-item, .nav-btn-main');
        this.statusContainer = document.getElementById('status');
        this.settingsMenu = document.getElementById('settings-menu');
        this.navBadge = document.getElementById('nav-badge');
    }

    showSection(id) {
        this.sections.forEach(s => {
            s.classList.toggle('seccion-activa', s.id === `seccion-${id}`);
        });

        this.navBtns.forEach(b => {
            b.classList.toggle('active', b.id === `btn-${id}`);
        });

        // Auto close settings menu if open
        if (this.settingsMenu && this.settingsMenu.classList.contains('active')) {
            this.toggleSettingsMenu();
        }
    }

    toggleSettingsMenu() {
        if (!this.settingsMenu) return;
        this.settingsMenu.classList.toggle('active');

        // Close when clicking outside
        if (this.settingsMenu.classList.contains('active')) {
            const handleOutside = (e) => {
                if (!e.target.closest('.settings-container')) {
                    this.settingsMenu.classList.remove('active');
                    document.removeEventListener('click', handleOutside);
                }
            };
            setTimeout(() => document.addEventListener('click', handleOutside), 10);
        }
    }

    updateBadge(show) {
        if (!this.navBadge) return;
        this.navBadge.style.display = show ? 'block' : 'none';

        // Add a subtle shake to interest the user
        if (show) {
            const gear = document.querySelector('.btn-icon-settings');
            gear.style.animation = 'none';
            setTimeout(() => gear.style.animation = 'shakeGear 0.5s ease-out', 10);
        }
    }

    showNotification(message, type = 'success', duration = 5000) {
        const div = document.createElement('div');
        div.className = `notificacion-flotante notificacion-${type}`;
        div.innerHTML = `
            ${this._getIcon(type)}
            <span>${message}</span>
        `;

        this.statusContainer.appendChild(div);

        setTimeout(() => {
            div.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => div.remove(), 300);
        }, duration);
    }

    _getIcon(type) {
        switch (type) {
            case 'success': return '✅';
            case 'error': return '❌';
            case 'processing': return '<span class="loading"></span>';
            case 'warning': return '⚠️';
            default: return 'ℹ️';
        }
    }

    updateStoreSelector(stores, onSelect) {
        const select = document.getElementById('select-tienda');
        const search = document.getElementById('search-tienda');

        const render = (filter = '') => {
            select.innerHTML = '';
            Object.entries(stores)
                .filter(([id, meta]) => {
                    const searchStr = `${id} ${meta.nombre}`.toLowerCase();
                    return searchStr.includes(filter.toLowerCase());
                })
                .forEach(([id, meta]) => {
                    const opt = document.createElement('option');
                    opt.value = id;
                    opt.textContent = `${id} - ${meta.nombre}`;
                    select.appendChild(opt);
                });
        };

        if (search) {
            search.addEventListener('input', (e) => render(e.target.value));
        }
        render();

        // Default store 1092
        if (stores["1092"]) {
            select.value = "1092";
            if (onSelect) onSelect("1092");
        }
    }

    showPdfModal(pdfData) {
        const modal = document.getElementById('pdf-modal');
        const iframe = document.getElementById('pdf-iframe');
        const downloadBtn = document.getElementById('btn-download-pdf');
        const closeBtn = document.getElementById('btn-close-modal');

        // Set iframe source
        iframe.src = pdfData.url;

        // Show modal
        modal.classList.add('active');

        // Download handler
        const handleDownload = () => {
            const link = document.createElement('a');
            link.href = pdfData.url;
            link.download = pdfData.filename;
            link.click();
        };

        // Close handler
        const handleClose = () => {
            modal.classList.remove('active');
            iframe.src = '';
            URL.revokeObjectURL(pdfData.url);
            downloadBtn.removeEventListener('click', handleDownload);
            closeBtn.removeEventListener('click', handleClose);
            modal.removeEventListener('click', handleBackdropClick);
        };

        // Backdrop click handler
        const handleBackdropClick = (e) => {
            if (e.target === modal) {
                handleClose();
            }
        };

        // Attach event listeners
        downloadBtn.addEventListener('click', handleDownload);
        closeBtn.addEventListener('click', handleClose);
        modal.addEventListener('click', handleBackdropClick);

        // ESC key to close
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                handleClose();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    updateUnknownProducts(products, onSave, listaPasillos = []) {
        const container = document.getElementById('completar-contenido');
        if (!products || products.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:3rem; color:#64748b;">No hay productos pendientes.</div>';
            return;
        }

        container.innerHTML = '';
        products.forEach(p => {
            const card = this._createUnknownProductCard(p, onSave, listaPasillos);
            container.appendChild(card);
        });
    }

    _createUnknownProductCard(p, onSave, listaPasillos) {
        const div = document.createElement('div');
        div.className = 'producto-card';

        const pasilloOptions = listaPasillos.map(pas =>
            `<option value="${pas}" ${p.pasillo === pas ? 'selected' : ''}>${pas}</option>`
        ).join('');

        div.innerHTML = `
            <div class="producto-card-header">
                <span class="producto-card-sku">SKU: ${p.sku}</span>
                <span class="producto-card-stock">Stock: ${p.stock}</span>
            </div>
            <div class="form-group">
                <label>Descripción:</label>
                <input type="text" class="prod-desc" placeholder="Nombre del producto" value="${p.descripcion === 'PRODUCTO DESCONOCIDO' ? '' : p.descripcion}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>ID Depto:</label>
                    <input type="number" class="prod-dept" placeholder="Ej: 92" value="${p.deptId === 'SIN_INFO' ? '' : p.deptId}">
                </div>
                <div class="form-group">
                    <label>Pasillo:</label>
                    <select class="prod-pasillo">
                        <option value="">Seleccionar...</option>
                        ${pasilloOptions}
                        <option value="S/D">S/D (Sin Pasillo)</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>UPC:</label>
                <input type="text" class="prod-upc" placeholder="Código de barras" value="${p.upc || ''}">
            </div>
            <button class="producto-card-btn">Guardar Información</button>
        `;

        const btn = div.querySelector('.producto-card-btn');
        btn.addEventListener('click', () => {
            const data = {
                sku: p.sku,
                descripcion: div.querySelector('.prod-desc').value.toUpperCase(),
                deptId: div.querySelector('.prod-dept').value,
                pasillo: div.querySelector('.prod-pasillo').value,
                upc: div.querySelector('.prod-upc').value
            };

            if (!data.descripcion || !data.deptId || !data.pasillo) {
                this.showNotification('Descripción, Depto y Pasillo son obligatorios', 'warning');
                return;
            }

            onSave(data, div);
        });

        return div;
    }

    updateHistoryView(historyData, onLoad) {
        const container = document.getElementById('lista-historial');
        if (!historyData || historyData.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:3rem; color:#64748b;">No hay registros previos para esta tienda.</div>';
            return;
        }

        container.innerHTML = historyData.map(item => `
            <div class="history-item">
                <div class="history-info-main">
                    <span class="history-date-badge">${item.fecha}</span>
                    <span class="history-store-name">${item.nombreTienda || 'Tienda'}</span>
                    <div class="history-stats-pill">
                        ${item.totalItems} productos encontrados
                    </div>
                </div>
                <button class="btn-cargar-historia" data-fecha="${item.fecha}" data-tienda="${item.idTienda}">
                    📥 Cargar Reporte
                </button>
            </div>
        `).join('');

        container.querySelectorAll('.btn-cargar-historia').forEach(btn => {
            btn.addEventListener('click', () => {
                const { fecha, tienda } = btn.dataset;
                onLoad(tienda, fecha);
            });
        });
    }

    showSummaryModal(report, onGeneratePdf) {
        const modal = document.getElementById('summary-modal');
        const content = document.getElementById('summary-modal-content');
        const btnPdf = document.getElementById('btn-modal-generar-pdf');
        const btnCompletar = document.getElementById('btn-modal-completar');
        const btnClose = document.getElementById('btn-close-summary');

        // Populate content
        const deptos = Object.entries(report.departamentos).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }));
        const hasUnknown = report.productosSinDepartamento && report.productosSinDepartamento.length > 0;

        content.innerHTML = `
            <div style="text-align: center; margin-bottom: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem;">
                <div class="summary-highlight">${report.totalItems}</div>
                <div class="summary-label">Items detectados para <strong>${report.nombreTienda}</strong></div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">Carga del ${report.fecha}</div>
            </div>
            
            <div style="padding-right: 0.5rem; margin-bottom: 1rem;">
                <h4 style="margin-bottom: 1rem; font-size: 0.875rem; color: var(--text-muted); display: flex; justify-content: space-between;">
                    <span>DETALLE POR DEPARTAMENTO:</span>
                    <span>${deptos.length} Deptos</span>
                </h4>
                <table class="summary-table">
                    <thead>
                        <tr>
                            <th style="font-size: 0.7rem;">DEPT</th>
                            <th style="font-size: 0.7rem;">NOMBRE</th>
                            <th style="text-align: right; font-size: 0.7rem;">CANT</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${deptos.map(([id, info]) => `
                            <tr>
                                <td style="font-family: monospace; font-weight: 600;">${id}</td>
                                <td style="font-weight: 500;">${info.nombre}</td>
                                <td style="text-align: right; font-weight: 700; color: var(--primary);">${info.cantidad}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            ${hasUnknown ? `
                <div style="margin-top: 1rem; padding: 1rem; background: #fff7ed; border: 1px solid #ffedd5; border-radius: 8px; color: #9a3412; font-size: 0.875rem; display: flex; align-items: center; gap: 0.75rem;">
                    <span style="font-size: 1.25rem;">⚠️</span>
                    <div>
                        Hay <strong>${report.productosSinDepartamento.length} productos</strong> sin pasillo ni departamento.
                    </div>
                </div>
            ` : ''}
        `;

        // Configure buttons
        btnCompletar.style.display = hasUnknown ? 'block' : 'none';

        const openModal = () => {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('active'), 10);
        };

        const closeModal = () => {
            modal.classList.remove('active');
            setTimeout(() => modal.style.display = 'none', 300);
        };

        btnClose.onclick = closeModal;
        btnPdf.onclick = () => {
            closeModal();
            onGeneratePdf();
        };
        btnCompletar.onclick = () => {
            closeModal();
            this.showSection('completar');
        };

        openModal();
    }
}

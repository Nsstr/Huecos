export class UiManager {
    constructor() {
        this.sections = document.querySelectorAll('section');
        this.navBtns = document.querySelectorAll('.nav-btn');
        this.statusContainer = document.getElementById('status');
    }

    showSection(id) {
        this.sections.forEach(s => {
            s.classList.toggle('seccion-activa', s.id === `seccion-${id}`);
        });

        this.navBtns.forEach(b => {
            b.classList.toggle('active', b.id === `btn-${id}`);
        });
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
}

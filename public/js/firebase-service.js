export class FirebaseService {
    constructor(config) {
        this.config = config;
        this.db = null;
        this.ready = false;
        this.inProgress = false;
    }

    async init() {
        try {
            const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
            const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

            const app = initializeApp(this.config);
            this.db = getFirestore(app);

            // Test connection
            const { collection, query, getDocs, limit } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const testQuery = query(collection(this.db, "huecos_gondola"), limit(1));
            await getDocs(testQuery);

            this.ready = true;
            console.log('🔥 Firebase SDK cargado correctamente');
            return true;
        } catch (error) {
            console.error('⚠️ Firebase error:', error);
            this.ready = false;
            return false;
        }
    }

    async saveReport(reportData) {
        if (!this.ready) return false;

        this.inProgress = true;
        try {
            const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

            const { idTienda, fecha } = reportData;
            const docId = `${idTienda}_${fecha}`;
            const reportRef = doc(this.db, "huecos_gondola", docId);

            // Save the entire report in ONE document to save quota
            await setDoc(reportRef, {
                ...reportData,
                timestamp: new Date().toISOString()
            });

            return true;
        } catch (error) {
            console.error('❌ Error saving to Firebase:', error);
            throw error;
        } finally {
            this.inProgress = false;
        }
    }

    async loadReport(idTienda, fecha) {
        if (!this.ready) return null;

        try {
            const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const docId = `${idTienda}_${fecha}`;
            const reportRef = doc(this.db, "huecos_gondola", docId);
            const reportSnap = await getDoc(reportRef);

            if (!reportSnap.exists()) return null;
            return reportSnap.data();
        } catch (error) {
            console.error('❌ Error loading from Firebase:', error);
            return null;
        }
    }

    async saveStockReportRaw(text) {
        if (!this.ready) return false;
        try {
            const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const configRef = doc(this.db, "config", "ultimo_reporte_stock");
            await setDoc(configRef, {
                rawText: text,
                timestamp: new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('❌ Error saving Stock Report to Firebase:', error);
            return false;
        }
    }

    async loadStockReportRaw() {
        if (!this.ready) return null;
        try {
            const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const configRef = doc(this.db, "config", "ultimo_reporte_stock");
            const snap = await getDoc(configRef);
            return snap.exists() ? snap.data().rawText : null;
        } catch (error) {
            console.warn('⚠️ No se pudo cargar el reporte stock previo');
            return null;
        }
    }

    async getHistoricalSummaries(idTienda) {
        if (!this.ready) return [];
        try {
            const { collection, query, where, getDocs, limit } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

            // Removing orderBy to avoid the need for a composite index
            const q = query(
                collection(this.db, "huecos_gondola"),
                where("idTienda", "==", idTienda),
                limit(100) // Fetch more to ensure we have enough to sort
            );

            const snap = await getDocs(q);
            const history = [];
            snap.forEach(doc => {
                const data = doc.data();
                history.push({
                    idTienda: data.idTienda,
                    nombreTienda: data.nombreTienda,
                    fecha: data.fecha,
                    totalItems: data.totalItems,
                    departamentos: data.departamentos,
                    timestamp: data.timestamp
                });
            });

            // Sort manually in Memory (Newest first)
            return history.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
        } catch (error) {
            console.error('❌ Error getting history:', error);
            throw error; // Re-throw to show in UI
        }
    }

    async deleteDetailedOldReports() {
        if (!this.ready) return;
        try {
            const { collection, query, getDocs, where, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

            // This is a simplified version. For a real production app, 
            // cleaning up detailed data while keeping summaries would involve 
            // partial updates. For now, we'll just implement the logic to find old ones.
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const dateStr = sevenDaysAgo.toISOString().split('T')[0];

            const q = query(collection(this.db, "huecos_gondola"), where("fecha", "<", dateStr));
            const snap = await getDocs(q);

            // Caution: We'll keep them for now as per "History" requirement, 
            // but we could clean the 'productosConInfo' array to save space.
            console.log(`[Cleanup] Found ${snap.size} old reports.`);
        } catch (error) {
            console.warn('Cleanup failed:', error);
        }
    }

    async saveCustomProductInfo(prodData) {
        if (!this.ready) return false;
        try {
            const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const prodRef = doc(this.db, "productos_personalizados", prodData.sku);
            await setDoc(prodRef, {
                ...prodData,
                timestamp: new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('❌ Error saving custom product:', error);
            return false;
        }
    }

    async loadCustomProducts() {
        if (!this.ready) return [];
        try {
            const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const querySnapshot = await getDocs(collection(this.db, "productos_personalizados"));
            const products = [];
            querySnapshot.forEach(doc => products.push(doc.data()));
            return products;
        } catch (error) {
            console.error('❌ Error loading custom products:', error);
            return [];
        }
    }
    async clearHistoricalData() {
        if (!this.ready) return;
        try {
            const { collection, getDocs, deleteDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

            const colName = "huecos_gondola"; // ONLY clear reports/history
            const snap = await getDocs(collection(this.db, colName));

            const deletePromises = snap.docs.map(d => deleteDoc(doc(this.db, colName, d.id)));
            await Promise.all(deletePromises);

            console.log('✨ Historial limpiado correctamente');
            return true;
        } catch (error) {
            console.error('❌ Error cleaning history:', error);
            throw error;
        }
    }
}

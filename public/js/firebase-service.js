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
            const { doc, setDoc, collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

            const { idTienda, fecha, productosConInfo, ...metadata } = reportData;
            const docId = `${idTienda}_${fecha}`;
            const reportRef = doc(this.db, "huecos_gondola", docId);

            // Save metadata
            await setDoc(reportRef, {
                ...metadata,
                idTienda,
                fecha,
                timestamp: new Date().toISOString()
            });

            // Save products in subcollection
            const productsRef = collection(reportRef, "productos");
            const batchSize = 50;

            for (let i = 0; i < productosConInfo.length; i += batchSize) {
                const batch = productosConInfo.slice(i, i + batchSize);
                await Promise.all(batch.map(p => addDoc(productsRef, {
                    ...p,
                    idTienda,
                    timestamp: new Date().toISOString()
                })));
            }

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
            const { doc, getDoc, collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

            const docId = `${idTienda}_${fecha}`;
            const reportRef = doc(this.db, "huecos_gondola", docId);
            const reportSnap = await getDoc(reportRef);

            if (!reportSnap.exists()) return null;

            const reportData = reportSnap.data();
            const productsRef = collection(reportRef, "productos");
            const productsSnap = await getDocs(productsRef);

            const productosConInfo = [];
            productsSnap.forEach(doc => productosConInfo.push(doc.data()));

            return {
                ...reportData,
                productosConInfo
            };
        } catch (error) {
            console.error('❌ Error loading from Firebase:', error);
            return null;
        }
    }
}

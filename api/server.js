import express from 'express';
import companyRoutes from './routes/companyRoutes.js';

const app = express();
const PORT = 3000;

app.use(express.json());

app.use('/api/companies', companyRoutes);

app.listen(PORT, () => {
    console.log(`🚀 Company API Gateway running at http://localhost:${PORT}`);
    console.log(`📡 Endpoints:`);
    console.log(`   - POST/GET http://localhost:3000/api/companies/match`);
});
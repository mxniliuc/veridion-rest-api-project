import express from 'express';
import { matchCompany } from '../controllers/companyController.js';

const router = express.Router();

router.all('/match', matchCompany); 

export default router;
import * as companyService from '../services/companyService.js';

export const matchCompany = async (req, res) => {
    try {
        const { name, website, phone, facebook } = { ...req.query, ...req.body };

        if (!name && !website && !phone && !facebook) {
            return res.status(400).json({ error: "Missing search criteria" });
        }

        const result = await companyService.findBestMatch({ name, website, phone, facebook });

        if (result) {
            return res.json({
                success: true,
                ...result
            });
        }

        return res.status(404).json({ success: false, message: "No match found" });
    } catch (error) {
        console.error("Match Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
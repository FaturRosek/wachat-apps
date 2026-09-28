const express = require('express');
const router = express.Router();
const ContactController = require('../controllers/contactController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', ContactController.getContacts);
router.post('/sync', ContactController.syncContacts);
router.get('/:id', ContactController.getContactById);

module.exports = router;

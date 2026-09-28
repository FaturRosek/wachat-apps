const ContactModel = require('../models/contactModel');

const ContactService = {
  async getContacts(userId, queryOptions) {
    return await ContactModel.getAllByUser(userId, queryOptions);
  },

  async getContactById(id, userId) {
    const contact = await ContactModel.findById(id, userId);
    if (!contact) {
      const error = new Error('Contact not found');
      error.statusCode = 404;
      throw error;
    }
    return contact;
  }
};

module.exports = ContactService;

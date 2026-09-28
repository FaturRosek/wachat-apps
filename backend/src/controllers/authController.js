const AuthService = require('../services/authService');

const AuthController = {
  async register(req, res, next) {
    try {
      const { name, email, password } = req.body;
      const result = await AuthService.register({ name, email, password });
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login({ email, password });
      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  async getMe(req, res, next) {
    try {
      const user = await AuthService.getProfile(req.user.id);
      res.status(200).json({
        success: true,
        data: { user }
      });
    } catch (error) {
      next(error);
    }
  },

  async logout(req, res) {
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  }
};

module.exports = AuthController;

import app from './app';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5000;

const startServer = () => {
  try {
    app.listen(PORT, () => {
      console.log(`🚀 Server is running at http://localhost:${PORT}`);
      console.log(`👉 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Error starting server:', error);
    process.exit(1);
  }
};

startServer();

import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { connect } from './net.js';

connect();
createRoot(document.getElementById('root')).render(<App />);
